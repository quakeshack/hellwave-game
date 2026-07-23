import type { Action, ClientEngineAPI, DiscoveredSession, GLTexture, MenuItem } from '../../../../shared/GameInterfaces.ts';

import { ServerGameAPI } from '../../GameAPI.ts';

import MenuCommon, { LABEL_LINE_HEIGHT } from './MenuCommon.ts';
import ProfileMenu from './ProfileMenu.ts';

// Lines up with the logo's own virtual x position (see #drawLogo).
const SIDEBAR_X = 24;
// Pushed clear of the sidebar column so the two don't visually crowd each other -- the sidebar's
// own hit-test boundary (see build()'s layout.hitTest) is derived from this same constant.
const SESSIONS_X = 210;
const ROWS_START_Y = 100;
// Taller than the header font's own glyph height (16 virtual units) so sidebar rows get visible
// breathing room instead of glyphs from adjacent rows touching.
const SIDEBAR_ROW_SPACING = 28;
// Session rows are three lines tall (hostname, then map/player-count, then round) plus the
// thumbnail -- see plans/hellwave-lobby-cards.md Design §4. Independent of SIDEBAR_ROW_SPACING
// since the two columns' rows no longer need to line up vertically.
const SESSION_ROW_SPACING = 52;
// Shared vertical gap between any two stacked text lines in a session row (glyph height + a
// little breathing room) -- used twice: hostname down to the map/player-count line, and that line
// down to the round line.
const SESSION_LINE_GAP = LABEL_LINE_HEIGHT + 4;
// Vertical offset (from a session row's own y) for the map/player-count line and thumbnail --
// shifted down one line's worth to make room for the hostname line above them.
const CONTENT_LINE_OFFSET = SESSION_LINE_GAP;
// Vertical offset (from a session row's own y) for the round indicator, its third line.
const ROUND_LINE_OFFSET = CONTENT_LINE_OFFSET + SESSION_LINE_GAP;
// Hostnames are player-chosen and unbounded -- truncated (with a trailing "...") so a long one
// can't blow out the row's width or run into the next column.
const HOSTNAME_MAX_CHARS = 32;
// Only drawn for sidebar rows before the header font finishes loading (a brief transient state --
// once loaded, the font's own hover/normal color rows convey focus, making the cursor glyph
// redundant). Session rows use a hover border instead (see SESSION_ROW_CONTENT_HEIGHT), matching
// the map picker's focused-card border. A plain printable character rather than the classic
// special glyph codes (12/13) `VerticalLayout` uses -- those codes are whatever a custom font's
// low-range "graphics" cells happen to contain, which isn't guaranteed to look like an
// arrow/cursor at all. Printable ASCII is always safe.
const CURSOR_MARKER = '>';

// Target on-screen width (virtual menu-space units) for the hi-res logo -- it's a real PNG
// (896x119), not a low-res LMP where "native size" already maps to a sane virtual footprint, so
// it needs an explicit scale rather than the menu's usual DrawPic(x, y, pic) 1:1-native draw.
// Deliberately not halved along with the position constants above -- keeping it at its original
// value is what actually makes the logo render ~2x bigger on screen (see MenuCommon.ts's
// VIEWPORT_WIDTH/HEIGHT comment).
const LOGO_VIRTUAL_WIDTH = 320;
// Top margin for the logo and the player name -- horizontally, both line up with SIDEBAR_X
// instead of their own separate margin, so the logo's left edge is flush with the sidebar below
// it (and the name's right edge is flush with the same gutter on the other side).
const HEADER_TOP_MARGIN = 12;

// Session-row map thumbnail (virtual menu-space units).
const THUMBNAIL_SIZE = 20;
const THUMBNAIL_GAP = 6;
// Height of a session row's actual content, hostname line through the round line's bottom
// (ROUND_LINE_OFFSET + LABEL_LINE_HEIGHT) -- the tight content bounding box, not the border itself
// (see SESSION_ROW_BORDER_PADDING, which pads evenly on every side so the content sits centered
// within the border rather than flush at the top).
const SESSION_ROW_CONTENT_HEIGHT = ROUND_LINE_OFFSET + LABEL_LINE_HEIGHT;
// Gap between the row's actual content (thumbnail/text) and the hover border drawn around it --
// `MenuCommon.drawHoverBorder`'s own inset (`HOVER_BORDER_THICKNESS`) only clears the border line
// itself from the content, leaving it flush with no breathing room; this adds a deliberate margin
// on top of that.
const SESSION_ROW_BORDER_PADDING = 4;

let hiResLogoPic: GLTexture | null = null;

/**
 * Per-session-row data the custom layout needs at draw time, beyond what an `Action`'s own
 * `label` carries -- kept out of `Action` itself since it's plain informational text (the round
 * line), not a second focusable/clickable element.
 */
interface SessionRowInfo {
  readonly hostname: string;
  readonly map: string;
  readonly roundLabel: string | null;
}

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

  // Map-name-keyed thumbnail cache, loaded once from build() -- same recipe as NewGameMenu's own
  // map-picture cache. Session rows resolve their thumbnail by map name every draw, so a picture
  // that finishes loading after a row was already built still appears without a rebuild.
  static #mapPictures = new Map<string, GLTexture>();
  // Map-name-keyed curated label (e.g. 'hw_doom' -> 'Doomed computer station'), populated
  // synchronously alongside #mapPictures -- session rows fall back to the raw map name when a
  // session runs a map outside the curated list.
  static #mapLabels = new Map<string, string>();
  // Index-aligned with the session Action rows past #sidebarCount (not with mainPage.items as a
  // whole -- the 'Finding games...'/'No active games.'/error Label rows never populate this),
  // rebuilt every refreshSessions() call alongside the Actions themselves.
  static #sessionRows: SessionRowInfo[] = [];
  // The widest session row's content (virtual units, thumbnail+label or hostname, whichever is
  // wider) currently on screen -- every session row's hover border uses this shared width rather
  // than its own content's width, so focusing a narrower row doesn't visibly shrink the border
  // relative to its neighbors.
  static #maxSessionContentWidth = 0;

  /**
   * Truncate a player-chosen hostname so it can never blow out a row's width -- unlike the map
   * label (curated, known-short) or the round line (numbers only), hostnames are free text of
   * unbounded length.
   * @returns `hostname` unchanged if it already fits, otherwise clipped with a trailing "...".
   */
  static #truncateHostname(hostname: string): string {
    if (hostname.length <= HOSTNAME_MAX_CHARS) {
      return hostname;
    }

    return `${hostname.slice(0, HOSTNAME_MAX_CHARS - 3)}...`;
  }

  /**
   * Draw the hellwave logo top-left, or a plain-text stand-in while the hi-res PNG is still
   * loading (or if it failed to load at all).
   */
  static #drawLogo(engineAPI: ClientEngineAPI): void {
    if (hiResLogoPic === null) {
      engineAPI.Menu.PrintWhite(SIDEBAR_X, HEADER_TOP_MARGIN, 'HELLWAVE');
      return;
    }

    const scale = (LOGO_VIRTUAL_WIDTH * engineAPI.Menu.viewportScale) / hiResLogoPic.width;
    const { x, y } = MenuCommon.toScreenPosition(engineAPI, SIDEBAR_X, HEADER_TOP_MARGIN);

    engineAPI.DrawPic(x, y, hiResLogoPic, scale);
  }

  /**
   * Virtual menu-space position for the row at `index` in the combined `page.items` array.
   * @returns The row's top-left position.
   */
  static #rowPosition(index: number): { x: number; y: number } {
    const isSidebar = index < MainMenu.#sidebarCount;

    if (isSidebar) {
      return { x: SIDEBAR_X, y: ROWS_START_Y + index * SIDEBAR_ROW_SPACING };
    }

    const rowIndex = index - MainMenu.#sidebarCount;

    return { x: SESSIONS_X, y: ROWS_START_Y + rowIndex * SESSION_ROW_SPACING };
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
    const viewport = MenuCommon.getViewport(engineAPI);

    engineAPI.LoadPicFromFile('gfx/logo.png').then((texture: GLTexture): void => {
      texture.lockTextureMode('GL_LINEAR'); // smooth scaling, matches the loading-screen texture
      hiResLogoPic = texture;
    }).catch((): void => {
      engineAPI.ConsoleWarning('Couldn\'t load hellwave logo picture.\n');
    });

    // Same up-front load-and-cache recipe as NewGameMenu's map-picker cards, keyed by map name so
    // a session row can resolve its thumbnail and label with a plain lookup once loading resolves.
    for (const map of ServerGameAPI.GetMapList() ?? []) {
      MainMenu.#mapLabels.set(map.name, map.label);

      const picturePath = map.pictures[0];
      if (picturePath === undefined) {
        continue;
      }

      engineAPI.LoadPicFromFile(picturePath).then((texture: GLTexture): void => {
        texture.lockTextureMode('GL_LINEAR');
        MainMenu.#mapPictures.set(map.name, texture);
      }).catch((): void => {
        engineAPI.ConsoleWarning(`Couldn't load map picture for ${map.name}.\n`);
      });
    }

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
          const isSessionRow = index >= MainMenu.#sidebarCount && item instanceof Action;
          const sessionRow = isSessionRow ? MainMenu.#sessionRows[index - MainMenu.#sidebarCount] : undefined;
          const contentY = y + (sessionRow ? CONTENT_LINE_OFFSET : 0);
          let textX = x;

          if (sessionRow) {
            Menu.PrintWhite(x, y, sessionRow.hostname);

            const picture = MainMenu.#mapPictures.get(sessionRow.map);

            if (picture) {
              const scale = (THUMBNAIL_SIZE * engineAPI.Menu.viewportScale) / picture.width;
              const { x: screenX, y: screenY } = MenuCommon.toScreenPosition(engineAPI, x, contentY);
              engineAPI.DrawPic(screenX, screenY, picture, scale);
            }

            textX = x + THUMBNAIL_SIZE + THUMBNAIL_GAP;
          }

          item.draw(textX, contentY, focused);

          if (sessionRow?.roundLabel) {
            Menu.Print(textX, y + ROUND_LINE_OFFSET, sessionRow.roundLabel);
          }

          if (sessionRow) {
            // Session rows get a hover border around the whole row (thumbnail + text) instead of
            // a text cursor -- same visual language as the map picker's focused-card border, but
            // padded away from the content instead of hugging it flush.
            if (focused && item.focusable) {
              const padding = SESSION_ROW_BORDER_PADDING;
              MenuCommon.drawHoverBorder(
                engineAPI,
                x - padding,
                y - padding,
                MainMenu.#maxSessionContentWidth + padding * 2,
                SESSION_ROW_CONTENT_HEIGHT + padding * 2,
              );
            }
          } else {
            const hasColorFocusFeedback = item instanceof Action && item.font !== null;
            if (focused && item.focusable && !hasColorFocusFeedback) {
              Menu.PrintWhite(textX - 16, y, CURSOR_MARKER);
            }
          }
        }
      },
      hitTest(rowItems: MenuItem[], px: number, py: number): number | null {
        for (const [index, item] of rowItems.entries()) {
          if (!item.visible || !item.focusable) {
            continue;
          }

          const { x, y } = MainMenu.#rowPosition(index);
          const isSidebar = index < MainMenu.#sidebarCount;
          const xEnd = isSidebar ? SESSIONS_X : viewport.width;
          const rowHeight = isSidebar ? SIDEBAR_ROW_SPACING : SESSION_ROW_SPACING;

          if (px >= x - 8 && px < xEnd && py >= y && py < y + rowHeight) {
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

    // Replaces mainPage.items past #sidebarCount with a single status Label -- used for the
    // loading/empty/error states, none of which have session rows of their own.
    const showSessionsMessage = (label: string): void => {
      mainPage.items.length = MainMenu.#sidebarCount;
      MainMenu.#sessionRows.length = 0;
      MainMenu.#maxSessionContentWidth = 0;
      mainPage.items.push(new Label({ label }));
    };

    // Rebuilds mainPage.items past #sidebarCount from a live session list -- called on every
    // push from SubscribeSessions (the initial snapshot, and every add/update/remove diff
    // thereafter), the same "slice back and re-push" pattern as before, just event-driven instead
    // of poll-driven.
    const rebuildSessionRows = (sessions: DiscoveredSession[]): void => {
      if (sessions.length === 0) {
        showSessionsMessage('No active games.');
        return;
      }

      mainPage.items.length = MainMenu.#sidebarCount;
      MainMenu.#sessionRows.length = 0;
      MainMenu.#maxSessionContentWidth = 0;

      for (const session of sessions) {
        const label = MainMenu.#mapLabels.get(session.map) ?? session.map;
        const fullLabel = `${label} [${session.currentPlayers}/${session.maxPlayers}]`;
        const hostname = MainMenu.#truncateHostname(session.hostname);

        mainPage.items.push(new Action({
          label: fullLabel,
          action: () => { joinSession(session.sessionId); },
        }));

        const rowContentWidth = Math.max(hostname.length * 8, THUMBNAIL_SIZE + THUMBNAIL_GAP + fullLabel.length * 8);
        MainMenu.#maxSessionContentWidth = Math.max(MainMenu.#maxSessionContentWidth, rowContentWidth);

        // Both come from hellwave's own Cvar.FLAG.SERVER-swept settings (see
        // plans/hellwave-lobby-cards.md Design §1/§2) -- absent entirely for an older or
        // non-hellwave server, in which case the round line is simply omitted.
        const roundCurrent = session.settings.hw_round_current;
        const roundLimit = session.settings.hw_rounds;
        const roundLabel = roundCurrent !== undefined && roundLimit !== undefined
          ? `round ${roundCurrent}/${roundLimit}`
          : null;

        MainMenu.#sessionRows.push({ hostname, map: session.map, roundLabel });
      }
    };

    let unsubscribeSessions: (() => void) | null = null;

    const mainPage = new MenuPageClass({
      items,
      layout,
      onEscape: () => { Menu.Close(); },
      onEnter: () => {
        unsubscribeSessions = engineAPI.Multiplayer.SubscribeSessions(
          (sessions) => { rebuildSessionRows(sessions); },
          (status) => {
            switch (status) {
              case 'connecting':
                showSessionsMessage('Finding games...');
                break;
              case 'reconnecting':
                showSessionsMessage('Game lobby error.');
                break;
              case 'unavailable':
                showSessionsMessage('Game lobby error.');
                engineAPI.ConsoleError('Failed to subscribe to hellwave sessions: signaling unavailable\n');
                break;
              default:
                break;
            }
          },
        );
      },
      onExit: () => {
        unsubscribeSessions?.();
        unsubscribeSessions = null;
      },
      customDraw: (page) => {
        MainMenu.#drawLogo(engineAPI);

        const name = engineAPI.GetCvar('_cl_name')?.string ?? '';
        const { x, y } = viewport.anchor('top-right', name.length * 8, 8, SIDEBAR_X, HEADER_TOP_MARGIN);
        Menu.PrintWhite(x, y, name);

        page.layout?.draw(page.items, page.cursor);
      },
      viewport,
    });

    Menu.RegisterPage('main', mainPage);

    return sidebarActions;
  }
}
