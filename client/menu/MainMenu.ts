import type { Action, ClientEngineAPI, GLTexture, MenuItem } from '../../../../shared/GameInterfaces.ts';

import MenuCommon from './MenuCommon.ts';
import ProfileMenu from './ProfileMenu.ts';

// Lines up with the logo's own virtual x position (see #drawLogo).
const SIDEBAR_X = 16;
// Pushed clear of the sidebar column so the two don't visually crowd each other -- the sidebar's
// own hit-test boundary (see build()'s layout.hitTest) is derived from this same constant.
const SESSIONS_X = 180;
const ROWS_START_Y = 56;
// Taller than the header font's own glyph height (16 virtual units) so sidebar rows get visible
// breathing room instead of glyphs from adjacent rows touching.
const ROW_SPACING = 24;
// Only drawn for session-list rows now -- sidebar items render with the header font, whose
// hover/normal color rows already convey focus, making a separate cursor glyph redundant there.
// A plain printable character rather than the classic special glyph codes (12/13) `VerticalLayout`
// uses -- those codes are whatever a custom font's low-range "graphics" cells happen to contain,
// which isn't guaranteed to look like an arrow/cursor at all. Printable ASCII is always safe.
const CURSOR_MARKER = '>';

// Target on-screen width (virtual menu-space units) for the hi-res logo -- it's a real PNG
// (896x119), not a low-res LMP where "native size" already maps to a sane virtual footprint, so
// it needs an explicit scale rather than the menu's usual DrawPic(x, y, pic) 1:1-native draw.
const LOGO_VIRTUAL_WIDTH = 140;

// How often the main page's session list re-fetches while it's the current page. "Every few
// seconds" per the plan; 5s balances staying current against hammering the signaling server.
const SESSION_POLL_INTERVAL_MS = 5000;

let hiResLogoPic: GLTexture | null = null;

/**
 * hellwave's own main menu ('main'), replacing id1's inherited image-based page (see
 * `plans/hellwave-main-menu-rework.md`): logo top-left, player name top-right, a sidebar, and a
 * main area showing a live, auto-refreshing list of joinable sessions.
 *
 * The sidebar and session area are two columns sharing one flat `page.items` array (sidebar items
 * first, `#sidebarCount` marking the boundary -- the session list re-populates the array past
 * that point on every refresh, the same "slice back and re-push" pattern id1's `launch_server`
 * page already uses). Positioning them side by side needs a custom `MenuLayout` (none of the
 * stock ones support two columns), but the items themselves are real `Action`s -- not a
 * hand-rolled focus/hit-test model -- specifically so keyboard nav, mouse click, *and* mouse
 * hover all come from the same `MenuPage`/`Action` machinery every other page already relies on,
 * rather than reimplementing (and risking missing a piece of) it.
 */
export default class MainMenu {
  static #sidebarCount = 0;

  /**
   * Draw the hellwave logo top-left, or a plain-text stand-in while the hi-res PNG is still
   * loading (or if it failed to load at all).
   */
  static #drawLogo(engineAPI: ClientEngineAPI): void {
    if (hiResLogoPic === null) {
      engineAPI.Menu.PrintWhite(16, 4, 'HELLWAVE');
      return;
    }

    const scale = (LOGO_VIRTUAL_WIDTH * 2) / hiResLogoPic.width;
    const { x, y } = MenuCommon.toScreenPosition(engineAPI, 16, 4);

    engineAPI.DrawPic(x, y, hiResLogoPic, scale);
  }

  /**
   * Virtual menu-space position for the row at `index` in the combined `page.items` array.
   * @returns The row's top-left position.
   */
  static #rowPosition(index: number): { x: number; y: number } {
    const isSidebar = index < MainMenu.#sidebarCount;
    const rowIndex = isSidebar ? index : index - MainMenu.#sidebarCount;

    return { x: isSidebar ? SIDEBAR_X : SESSIONS_X, y: ROWS_START_Y + rowIndex * ROW_SPACING };
  }

  /**
   * Registers 'main'.
   * @returns The sidebar actions, in display order, so `Menu.ts` can attach the header font to
   * them once it finishes loading (font loading and page construction happen concurrently -- see
   * `Menu.ts`'s `Init()`).
   */
  static build(engineAPI: ClientEngineAPI): Action[] {
    const { Menu } = engineAPI;
    const { Action, Label, MenuPage: MenuPageClass } = Menu;

    engineAPI.LoadPicFromFile('gfx/logo.png').then((texture: GLTexture): void => {
      texture.lockTextureMode('GL_LINEAR'); // smooth scaling, matches the loading-screen texture
      hiResLogoPic = texture;
    }).catch((): void => {
      engineAPI.ConsoleWarning('Couldn\'t load hellwave logo picture.\n');
    });

    const openMapPicker = (): void => { Menu.Push('hellwave_newgame'); };

    const newGameAction = new Action({
      label: 'New Game',
      // Gated on having a confirmed profile first, per "setup a profile, if needed" --
      // plans/hellwave-main-menu-rework.md §6.
      action: () => {
        if (ProfileMenu.isConfirmed(engineAPI)) {
          openMapPicker();
          return;
        }

        ProfileMenu.open(engineAPI, { onAccept: openMapPicker, label: 'Continue' });
      },
    });
    const profileAction = new Action({
      label: 'Profile',
      action: () => { ProfileMenu.open(engineAPI); },
    });
    const configureAction = new Action({ label: 'Options', action: () => { Menu.Push('options'); } });
    const quitAction = new Action({ label: 'Quit', action: () => { Menu.Push('quit'); } });

    const sidebarActions = [newGameAction, profileAction, configureAction, quitAction];
    const sidebarItems: MenuItem[] = sidebarActions;

    MainMenu.#sidebarCount = sidebarItems.length;

    // The session list refresh below repopulates the array past this point on every fetch --
    // see the class doc above and refreshSessions below.
    const items: MenuItem[] = [...sidebarItems];

    const layout = {
      draw(rowItems: MenuItem[], focusedIndex: number): void {
        for (const [index, item] of rowItems.entries()) {
          if (!item.visible) {
            continue;
          }

          const { x, y } = MainMenu.#rowPosition(index);
          const focused = index === focusedIndex;
          item.draw(x, y, focused);

          const hasColorFocusFeedback = item instanceof Action && item.font !== null;
          if (focused && item.focusable && !hasColorFocusFeedback) {
            Menu.PrintWhite(x - 16, y, CURSOR_MARKER);
          }
        }
      },
      hitTest(rowItems: MenuItem[], px: number, py: number): number | null {
        for (const [index, item] of rowItems.entries()) {
          if (!item.visible || !item.focusable) {
            continue;
          }

          const { x, y } = MainMenu.#rowPosition(index);
          const xEnd = index < MainMenu.#sidebarCount ? SESSIONS_X : 320;

          if (px >= x - 8 && px < xEnd && py >= y && py < y + ROW_SPACING) {
            return index;
          }
        }

        return null;
      },
    };

    const joinSession = (sessionId: string): void => {
      const connect = (): void => {
        Menu.Close();
        engineAPI.AppendConsoleText(`connect webrtc://${sessionId}\n`);
      };

      // Same profile gate as "New Game" -- plans/hellwave-main-menu-rework.md §6 calls out both
      // funnel entry points (New Game, joining a session) needing it.
      if (ProfileMenu.isConfirmed(engineAPI)) {
        connect();
        return;
      }

      ProfileMenu.open(engineAPI, { onAccept: connect, label: 'Continue' });
    };

    let hasLoadedSessionsOnce = false;
    let sessionRefreshInFlight = false;
    let pollIntervalId: ReturnType<typeof setInterval> | null = null;

    const refreshSessions = async (): Promise<void> => {
      // A poll tick firing while the previous fetch is still pending would otherwise race to
      // mutate mainPage.items concurrently; skip it and let the next tick try again.
      if (sessionRefreshInFlight) {
        return;
      }

      sessionRefreshInFlight = true;

      if (!hasLoadedSessionsOnce) {
        mainPage.items.length = MainMenu.#sidebarCount;
        mainPage.items.push(new Label({ label: 'Finding games...' }));
      }

      try {
        const sessions = await engineAPI.Multiplayer.ListSessions();

        // The sessionRefreshInFlight guard above rules out a concurrent call mutating
        // mainPage.items/hasLoadedSessionsOnce between this await and the assignments below.
        // eslint-disable-next-line require-atomic-updates
        mainPage.items.length = MainMenu.#sidebarCount;

        if (sessions.length === 0) {
          mainPage.items.push(new Label({ label: 'No active games.' }));
        } else {
          for (const session of sessions) {
            mainPage.items.push(new Action({
              label: `${session.map} [${session.currentPlayers}/${session.maxPlayers}]`,
              action: () => { joinSession(session.sessionId); },
            }));
          }
        }

        // eslint-disable-next-line require-atomic-updates
        hasLoadedSessionsOnce = true;
      } catch (error: unknown) {
        // eslint-disable-next-line require-atomic-updates
        mainPage.items.length = MainMenu.#sidebarCount;
        mainPage.items.push(new Label({ label: 'Game lobby error.' }));
        engineAPI.ConsoleError(`Failed to fetch hellwave sessions: ${String(error)}\n`);
      } finally {
        // eslint-disable-next-line require-atomic-updates
        sessionRefreshInFlight = false;
      }
    };

    const mainPage = new MenuPageClass({
      items,
      layout,
      onEscape: () => { Menu.Close(); },
      onEnter: () => {
        void refreshSessions();
        pollIntervalId = setInterval(() => { void refreshSessions(); }, SESSION_POLL_INTERVAL_MS);
      },
      onExit: () => {
        if (pollIntervalId !== null) {
          clearInterval(pollIntervalId);
          pollIntervalId = null;
        }
      },
      customDraw: (page) => {
        MainMenu.#drawLogo(engineAPI);

        const name = engineAPI.GetCvar('_cl_name')?.string ?? '';
        Menu.PrintWhite(320 - 8 - name.length * 8, 8, name);

        page.layout?.draw(page.items, page.cursor);
      },
    });

    Menu.RegisterPage('main', mainPage);

    return sidebarActions;
  }
}
