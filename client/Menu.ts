import type { Action, BitmapFont, ClientEngineAPI, GLTexture, MenuItem, MenuPic } from '../../../shared/GameInterfaces.ts';

import { cvarFlags } from '../../../shared/Defs.ts';
import Vector from '../../../shared/Vector.ts';
import { ServerGameAPI } from '../GameAPI.ts';

// Lines up with the logo's own virtual x position (see #drawLogo).
const SIDEBAR_X = 16;
// Pushed clear of the sidebar column so the two don't visually crowd each other -- the sidebar's
// own hit-test boundary (see #buildMainPage's layout.hitTest) is derived from this same constant.
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

const PROFILE_CONFIRMED_CVAR = 'hw_profile_confirmed';
const DEFAULT_PROFILE_ACCEPT_LABEL = 'Accept Changes';

// Target on-screen width (virtual menu-space units) for the hi-res logo -- it's a real PNG
// (896x119), not a low-res LMP where "native size" already maps to a sane virtual footprint, so
// it needs an explicit scale rather than the menu's usual DrawPic(x, y, pic) 1:1-native draw.
const LOGO_VIRTUAL_WIDTH = 140;

// Map-picker card layout (virtual menu-space units). Screenshots are square, so card height
// equals CARD_WIDTH. Map labels ("Doomed computer station") are long enough that they can
// overflow a single line at this width -- see #wrapLabel -- so labels get up to two lines below
// the card, each independently width-clamped to CARD_WIDTH.
const CARD_WIDTH = 120;
const CARD_GAP = 20;
const CARDS_START_Y = 40;
const CARD_LABEL_LINE_HEIGHT = 8;
const CARD_LABEL_Y = CARDS_START_Y + CARD_WIDTH + 6;
// Border drawn around the focused card, in the same light-blue the header font's hover/focused
// row (variant 0) uses -- sampled from gfx/header-font.png so the two focus cues visually match.
const CARD_HOVER_BORDER_COLOR = new Vector(0.733, 0.733, 0.733); // new Vector(171 / 255, 231 / 255, 255 / 255);
const CARD_HOVER_BORDER_THICKNESS = 2;

// How often the main page's session list re-fetches while it's the current page. "Every few
// seconds" per the plan; 5s balances staying current against hammering the signaling server.
const SESSION_POLL_INTERVAL_MS = 5000;

// New-game settings screen: rounds bounds match hw_rounds's own registered range/default
// (ServerGameAPI.Init, "Minimum 2, maximum 12") -- kept in sync manually since the Rounds
// stepper reads/writes through engineAPI rather than binding to that cvar live (see
// #buildNewGameSettingsPage for why).
const ROUNDS_MIN = 2;
const ROUNDS_MAX = 12;
const ROUNDS_DEFAULT = 10;
const SETTINGS_PREVIEW_X = 20;
const SETTINGS_PREVIEW_Y = 40;
const SETTINGS_PREVIEW_WIDTH = 80;
const SETTINGS_FIELDS_LABEL_X = 160;
// Start button: styled like the main menu's sidebar items (see #buildNewGameSettingsPage),
// bottom-right rather than stacked with the Rounds/Private Game fields -- mirrors the
// page-agnostic Back button's bottom-left corner (see M's #backButtonX/#backButtonY), with the
// same 16px margin from the right edge the sidebar/logo use on the left (see SIDEBAR_X).
const START_BUTTON_RIGHT_X = 304;
const START_BUTTON_Y = 216;

// Sidebar main-menu items ("New Game"/"Profile"/"Configure"/"Quit") are drawn with LibreQuake's
// stylized header font instead of the standard conchars font -- see #buildMainPage. The atlas is
// uppercase-only (26 letters, no digits/punctuation), which is exactly why it's deliberately not
// used for the dynamic session list below the sidebar (entries like "e1m1 [3/8]" need digits and
// brackets the font doesn't have).
const HEADER_FONT_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const HEADER_FONT_GLYPH_WIDTH = 12;
const HEADER_FONT_GLYPH_HEIGHT = 16;
const HEADER_FONT_CELL_WIDTH = 14;
const HEADER_FONT_CELL_HEIGHT = 18;

let bigboxPic: MenuPic = null!;
let menuplyrPic: MenuPic = null!;
let hiResLogoPic: GLTexture | null = null;
// Cached so #buildNewGameSettingsPage's customDraw can measure the Start button's label width for
// centering -- read live at draw time since the font finishes loading after page construction.
let menuFont: BitmapFont | null = null;

/**
 * hellwave's own main menu, replacing id1's inherited image-based page (see
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
export default class HellwaveMenu {
  static #sidebarCount = 0;

  // Configurable per-invocation state for 'hellwave_profile', set by #openProfile() right before
  // pushing -- lets the same page instance serve both as a standalone sidebar destination
  // (default: just pop back) and as a gate step inserted in front of another action (accept
  // performs that action instead). See plans/hellwave-main-menu-rework.md §6.
  static #profileOnAccept: () => void = () => {};
  static #profileAcceptLabel = DEFAULT_PROFILE_ACCEPT_LABEL;

  // Shared between #buildNewGamePage (loads them) and #buildNewGameSettingsPage (draws the
  // chosen one) -- keyed by MapDetails.name.
  static #mapPictures = new Map<string, GLTexture>();
  // Which card the player picked, set right before pushing 'hellwave_newgame_settings' -- same
  // "set state, then push" shape as #openProfile above.
  static #selectedMapName = '';
  static #selectedMapLabel = '';

  static Init(engineAPI: ClientEngineAPI): void {
    engineAPI.LoadPicFromFile('gfx/logo.png').then((texture: GLTexture): void => {
      texture.lockTextureMode('GL_LINEAR'); // smooth scaling, matches the loading-screen texture
      hiResLogoPic = texture;
    }).catch((): void => {
      engineAPI.ConsoleWarning('Couldn\'t load hellwave logo picture.\n');
    });

    bigboxPic = engineAPI.LoadPicFromLump('bigbox');
    // Placeholder until the async parse below replaces it -- matches id1's multiplayer page,
    // which needs the raw LMP-palette parse before DrawPicTranslate can use it correctly.
    menuplyrPic = engineAPI.LoadPicFromLump('menuplyr');
    engineAPI.Menu.LoadTranslatablePic('menuplyr').then((pic) => {
      menuplyrPic = pic;
    }).catch((error: Error) => {
      engineAPI.ConsoleError(`failed to load menuplyr translate texture: ${error.message}\n`);
    });

    engineAPI.RegisterCvar(
      PROFILE_CONFIRMED_CVAR, '0', cvarFlags.ARCHIVE,
      'Whether the player has confirmed their hellwave profile (name/colors) at least once.',
    );

    HellwaveMenu.#buildProfilePage(engineAPI);
    HellwaveMenu.#buildNewGamePage(engineAPI);
    const settingsActions = HellwaveMenu.#buildNewGameSettingsPage(engineAPI);
    const sidebarActions = HellwaveMenu.#buildMainPage(engineAPI);

    // Id1Menu.Init is called with `classicFrontend: false` for hellwave (see
    // plans/hellwave-menu-asset-cleanup.md), so it no longer sets the root page itself --
    // hellwave owns 'main' now and must claim the root explicitly.
    engineAPI.Menu.SetRootPage('main');

    engineAPI.LoadBitmapFont('gfx/header-font.png', {
      charset: HEADER_FONT_CHARSET,
      glyphWidth: HEADER_FONT_GLYPH_WIDTH,
      glyphHeight: HEADER_FONT_GLYPH_HEIGHT,
      cellWidth: HEADER_FONT_CELL_WIDTH,
      cellHeight: HEADER_FONT_CELL_HEIGHT,
      variants: 2,
    }).then((font) => {
      menuFont = font;
      for (const action of [...sidebarActions, ...settingsActions]) {
        action.font = font;
      }
    }).catch(() => {
      engineAPI.ConsoleWarning('Couldn\'t load hellwave menu header font.\n');
    });
  }

  static #isProfileConfirmed(engineAPI: ClientEngineAPI): boolean {
    return engineAPI.GetCvar(PROFILE_CONFIRMED_CVAR)?.string === '1';
  }

  /**
   * Open the profile page, either as a plain standalone destination (defaults: pop back on
   * accept, "Accept Changes" label) or as a gate in front of another action.
   */
  static #openProfile(engineAPI: ClientEngineAPI, options: { onAccept?: () => void; label?: string } = {}): void {
    HellwaveMenu.#profileOnAccept = options.onAccept ?? (() => { engineAPI.Menu.Pop(); });
    HellwaveMenu.#profileAcceptLabel = options.label ?? DEFAULT_PROFILE_ACCEPT_LABEL;
    engineAPI.Menu.Push('hellwave_profile');
  }

  /**
   * Convert a virtual menu-space (320x200) point into the real, resolution-aware screen pixel
   * `engineAPI.DrawPic` expects -- the same transform `M.DrawPic` uses internally
   * (`cx * 2 + VID.width / 2 - 320`). Needed whenever a picture has to be drawn through the
   * top-level `DrawPic` (explicit scale) instead of `Menu.DrawPic` (always native-pixel size).
   * @returns The equivalent real screen position.
   */
  static #toScreenPosition(engineAPI: ClientEngineAPI, x: number, y: number): { x: number; y: number } {
    const { VID } = engineAPI;

    return { x: x * 2 + Math.floor(VID.width / 2) - 320, y: y * 2 + Math.floor(VID.height / 2) - 200 };
  }

  /**
   * Draw a hollow border (four thin filled rects, not a filled box) around a virtual-space
   * rectangle -- used to highlight the focused map card in `#buildNewGamePage`.
   */
  static #drawHoverBorder(engineAPI: ClientEngineAPI, x: number, y: number, width: number, height: number): void {
    const t = CARD_HOVER_BORDER_THICKNESS;
    const { x: screenX, y: screenY } = HellwaveMenu.#toScreenPosition(engineAPI, x - t, y - t);
    const screenWidth = (width + t * 2) * 2;
    const screenHeight = (height + t * 2) * 2;
    const screenThickness = t * 2;

    engineAPI.DrawRect(screenX, screenY, screenWidth, screenThickness, CARD_HOVER_BORDER_COLOR); // top
    engineAPI.DrawRect(screenX, screenY + screenHeight - screenThickness, screenWidth, screenThickness, CARD_HOVER_BORDER_COLOR); // bottom
    engineAPI.DrawRect(screenX, screenY, screenThickness, screenHeight, CARD_HOVER_BORDER_COLOR); // left
    engineAPI.DrawRect(screenX + screenWidth - screenThickness, screenY, screenThickness, screenHeight, CARD_HOVER_BORDER_COLOR); // right
  }

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
    const { x, y } = HellwaveMenu.#toScreenPosition(engineAPI, 16, 4);

    engineAPI.DrawPic(x, y, hiResLogoPic, scale);
  }

  /**
   * Virtual menu-space position for the row at `index` in the combined `page.items` array.
   * @returns The row's top-left position.
   */
  static #rowPosition(index: number): { x: number; y: number } {
    const isSidebar = index < HellwaveMenu.#sidebarCount;
    const rowIndex = isSidebar ? index : index - HellwaveMenu.#sidebarCount;

    return { x: isSidebar ? SIDEBAR_X : SESSIONS_X, y: ROWS_START_Y + rowIndex * ROW_SPACING };
  }

  static #buildProfilePage(engineAPI: ClientEngineAPI): void {
    const { Menu } = engineAPI;
    const { Action, ColorPicker, MenuPage: MenuPageClass, Textbox, VerticalLayout } = Menu;

    let top = 0;
    let bottom = 0;
    let oldTop = 0;
    let oldBottom = 0;

    // Same layout as id1's multiplayer setup page's name field -- label on the left, input box
    // in a fixed column to the right (rather than stacked below), so it doesn't compete for
    // horizontal space with the player-color preview next to it.
    const nameTextbox = new Textbox({
      label: 'Name',
      width: 16,
      maxLength: 14,
      heightOverride: 24,
      customDraw: (textbox, x, y) => {
        if (!textbox.visible) {
          return;
        }

        const boxX = 160;
        Menu.Print(x, y, textbox.label);
        Menu.DrawTextBox(boxX, y - 8, textbox.width, 1);
        Menu.PrintWhite(boxX + 8, y, textbox.getValue());

        const glyph = textbox.getCursorGlyph();
        if (glyph !== null) {
          Menu.DrawCharacter(boxX + 8 + textbox.cursorPos * 8, y, glyph);
        }
      },
    });

    const acceptAction = new Action({ label: DEFAULT_PROFILE_ACCEPT_LABEL });

    const profilePage = new MenuPageClass({
      layout: new VerticalLayout({ startY: 48, spacing: 0, labelX: 64, cursorX: 56 }),
      items: [
        nameTextbox,
        new ColorPicker({ label: 'Vest', heightOverride: 24, getValue: () => top, setValue: (value) => { top = value; } }),
        new ColorPicker({ label: 'Pants', heightOverride: 36, getValue: () => bottom, setValue: (value) => { bottom = value; } }),
        acceptAction,
      ],
      onEscape: () => { Menu.Pop(); },
      onEnter: () => {
        nameTextbox.value = engineAPI.GetCvar('_cl_name')?.string ?? '';
        const color = engineAPI.GetCvar('_cl_color')?.value ?? 0;
        top = oldTop = color >> 4;
        bottom = oldBottom = color & 15;
        acceptAction.label = HellwaveMenu.#profileAcceptLabel;
      },
      customDraw: (page) => {
        page.layout?.draw(page.items, page.cursor);

        Menu.DrawPic(160, 56, bigboxPic);
        Menu.DrawPicTranslate(
          172, 64, menuplyrPic,
          (top << 4) + (top >= 8 ? 4 : 11),
          (bottom << 4) + (bottom >= 8 ? 4 : 11),
        );
      },
    });

    acceptAction.action = () => {
      if ((engineAPI.GetCvar('_cl_name')?.string ?? '') !== nameTextbox.getValue()) {
        engineAPI.AppendConsoleText(`name "${nameTextbox.getValue()}"\n`);
      }

      if (top !== oldTop || bottom !== oldBottom) {
        oldTop = top;
        oldBottom = bottom;
        engineAPI.AppendConsoleText(`color ${top} ${bottom}\n`);
      }

      engineAPI.SetCvar(PROFILE_CONFIRMED_CVAR, '1');
      HellwaveMenu.#profileOnAccept();
    };

    Menu.RegisterPage('hellwave_profile', profilePage);
  }

  /**
   * Greedily wrap `label` onto up to two lines, each clamped to `maxChars` -- map labels
   * ("Doomed computer station") can be longer than a single card is wide.
   * @returns One or two lines, each at most `maxChars` long.
   */
  static #wrapLabel(label: string, maxChars: number): string[] {
    if (label.length <= maxChars) {
      return [label];
    }

    const words = label.split(' ');
    let line = '';
    let index = 0;

    while (index < words.length && (line ? `${line} ${words[index]}` : words[index]).length <= maxChars) {
      line = line ? `${line} ${words[index]}` : words[index];
      index++;
    }

    const secondLine = words.slice(index).join(' ');

    return secondLine ? [line, secondLine] : [line];
  }

  /**
   * The "select a map" screen New Game leads to: one card per curated map (screenshot + name,
   * `ServerGameAPI.GetMapList()`). Picking a card opens the per-map settings screen
   * (`#buildNewGameSettingsPage`), not this method -- built on `ListPage` rather than plain
   * `MenuPage` so Left/Right (not just Up/Down) move between the side-by-side cards, matching
   * the original sketch's annotation for exactly that.
   */
  static #buildNewGamePage(engineAPI: ClientEngineAPI): void {
    const { Menu } = engineAPI;
    const { Action, ListPage } = Menu;

    const maps = ServerGameAPI.GetMapList() ?? [];

    for (const map of maps) {
      const picturePath = map.pictures[0];
      if (picturePath === undefined) {
        continue;
      }

      engineAPI.LoadPicFromFile(picturePath).then((texture: GLTexture): void => {
        texture.lockTextureMode('GL_LINEAR');
        HellwaveMenu.#mapPictures.set(map.name, texture);
      }).catch((): void => {
        engineAPI.ConsoleWarning(`Couldn't load map picture for ${map.name}.\n`);
      });
    }

    const items: MenuItem[] = maps.map((map) => new Action({
      label: map.label,
      action: () => {
        HellwaveMenu.#selectedMapName = map.name;
        HellwaveMenu.#selectedMapLabel = map.label;
        Menu.Push('hellwave_newgame_settings');
      },
    }));

    const cardsStartX = (320 - (maps.length * CARD_WIDTH + Math.max(0, maps.length - 1) * CARD_GAP)) / 2;

    const layout = {
      draw(rowItems: MenuItem[], focusedIndex: number): void {
        rowItems.forEach((item, index) => {
          const x = cardsStartX + index * (CARD_WIDTH + CARD_GAP);
          const picture = HellwaveMenu.#mapPictures.get(maps[index].name);

          if (picture) {
            const scale = (CARD_WIDTH * 2) / picture.width;
            const { x: screenX, y: screenY } = HellwaveMenu.#toScreenPosition(engineAPI, x, CARDS_START_Y);
            engineAPI.DrawPic(screenX, screenY, picture, scale);
          } else {
            Menu.Print(x, CARDS_START_Y + CARD_WIDTH / 2, 'Loading...');
          }

          if (index === focusedIndex) {
            HellwaveMenu.#drawHoverBorder(engineAPI, x, CARDS_START_Y, CARD_WIDTH, CARD_WIDTH);
          }

          const lines = HellwaveMenu.#wrapLabel(item.label, Math.floor(CARD_WIDTH / 8));
          lines.forEach((line, lineIndex) => {
            const labelX = x + Math.max(0, (CARD_WIDTH - line.length * 8) / 2);
            const labelY = CARD_LABEL_Y + lineIndex * CARD_LABEL_LINE_HEIGHT;

            if (index === focusedIndex) {
              Menu.PrintWhite(labelX, labelY, line);
            } else {
              Menu.Print(labelX, labelY, line);
            }
          });
        });
      },
      hitTest(rowItems: MenuItem[], px: number, py: number): number | null {
        for (const [index, item] of rowItems.entries()) {
          if (!item.visible || !item.focusable) {
            continue;
          }

          const x = cardsStartX + index * (CARD_WIDTH + CARD_GAP);
          const lineCount = HellwaveMenu.#wrapLabel(item.label, Math.floor(CARD_WIDTH / 8)).length;
          const cardBottom = CARD_LABEL_Y + lineCount * CARD_LABEL_LINE_HEIGHT;

          if (px >= x && px < x + CARD_WIDTH && py >= CARDS_START_Y && py < cardBottom) {
            return index;
          }
        }

        return null;
      },
    };

    const newGamePage = new ListPage({
      title: 'Select a Map',
      items,
      layout,
      onEscape: () => { Menu.Pop(); },
    });

    Menu.RegisterPage('hellwave_newgame', newGamePage);
  }

  /**
   * The per-map settings screen picking a card leads to: rounds count and public/private, then
   * Start. `hw_rounds`/`sv_public` are read on `onEnter` and only committed (via `SetCvar`) if
   * actually changed, same load-then-commit shape as the profile page -- deliberately *not* a
   * cvar-bound `Slider`/`Toggle`, since those read/write the real engine `Cvar` registry directly
   * rather than through `engineAPI`, which would be both untestable here (this file's tests use
   * `engineAPI.GetCvar`/`SetCvar` mocks, not the real registry) and, for `hw_rounds` specifically,
   * moot before `ServerGameAPI.Init()` has ever registered it. `NumberInput` (rather than
   * `ColorPicker`, used for the same "closure-backed numeric field" shape before it existed)
   * clamps at `ROUNDS_MIN`/`ROUNDS_MAX` instead of wrapping, and draws the rounds count itself
   * instead of it being baked into the label string. Starting always goes through
   * `Menu.StartMultiplayerGame` -- hellwave has no real singleplayer mode, so "New Game" hosts a
   * (possibly solo) multiplayer/coop session either way. Start is styled like the main menu's
   * sidebar items (header font, hover-color focus feedback -- see #buildMainPage) and pinned to
   * the bottom-right corner rather than stacked in the Rounds/Private Game fields column, so it
   * needs its own custom layout instead of a single stock `VerticalLayout` for all three items.
   * @returns `[startAction]`, so `Init()` can attach the header font once it finishes loading.
   */
  static #buildNewGameSettingsPage(engineAPI: ClientEngineAPI): Action[] {
    const { Menu } = engineAPI;
    const { Action, MenuPage: MenuPageClass, NumberInput, Toggle, VerticalLayout } = Menu;

    let roundsCount = ROUNDS_DEFAULT;
    let oldRoundsCount = ROUNDS_DEFAULT;
    let isPrivateGame = false;
    let oldIsPrivateGame = false;

    const roundsInput = new NumberInput({
      label: 'Rounds',
      min: ROUNDS_MIN,
      max: ROUNDS_MAX,
      getValue: () => roundsCount,
      setValue: (value) => { roundsCount = value; },
    });

    const privateToggle = new Toggle({
      label: 'Private Game',
      getValue: () => (isPrivateGame ? 1 : 0),
      setValue: (value) => { isPrivateGame = value === 1; },
      onLabel: 'yes',
      offLabel: 'no',
    });

    const startAction = new Action({ label: 'Start!', heightOverride: HEADER_FONT_GLYPH_HEIGHT });

    // Rounds/Private Game keep the stock two-column field layout (reused directly, sliced to just
    // those two items); Start is measured (once the header font has loaded) and right-aligned
    // separately below instead of being a third stacked field.
    const fieldsLayout = new VerticalLayout({ startY: 100, spacing: 8, labelX: SETTINGS_FIELDS_LABEL_X, cursorX: SETTINGS_FIELDS_LABEL_X - 12 });

    const settingsLayout = {
      draw(rowItems: MenuItem[], focusedIndex: number): void {
        fieldsLayout.draw(rowItems.slice(0, 2), focusedIndex);

        const start = rowItems[2];
        const startWidth = menuFont?.measure(start.label) ?? start.label.length * 8;
        const startX = START_BUTTON_RIGHT_X - startWidth;
        start.draw(startX, START_BUTTON_Y, focusedIndex === 2);
      },
      hitTest(rowItems: MenuItem[], px: number, py: number): number | null {
        const fieldsHit = fieldsLayout.hitTest(rowItems.slice(0, 2), px, py);
        if (fieldsHit !== null) {
          return fieldsHit;
        }

        const start = rowItems[2];
        const startWidth = menuFont?.measure(start.label) ?? start.label.length * 8;
        const startX = START_BUTTON_RIGHT_X - startWidth;

        if (start.focusable && px >= startX && px < startX + startWidth && py >= START_BUTTON_Y && py < START_BUTTON_Y + start.getHeight()) {
          return 2;
        }

        return null;
      },
    };

    const settingsPage = new MenuPageClass({
      title: 'New Game',
      layout: settingsLayout,
      items: [roundsInput, privateToggle, startAction],
      onEscape: () => { Menu.Pop(); },
      onEnter: () => {
        roundsCount = oldRoundsCount = engineAPI.GetCvar('hw_rounds')?.value ?? ROUNDS_DEFAULT;
        isPrivateGame = oldIsPrivateGame = (engineAPI.GetCvar('sv_public')?.value ?? 1) === 0;
      },
      customDraw: (page) => {
        const picture = HellwaveMenu.#mapPictures.get(HellwaveMenu.#selectedMapName);

        if (picture) {
          const scale = (SETTINGS_PREVIEW_WIDTH * 2) / picture.width;
          const { x, y } = HellwaveMenu.#toScreenPosition(engineAPI, SETTINGS_PREVIEW_X, SETTINGS_PREVIEW_Y);
          engineAPI.DrawPic(x, y, picture, scale);
        }

        for (const [lineIndex, line] of HellwaveMenu.#wrapLabel(HellwaveMenu.#selectedMapLabel, Math.floor(SETTINGS_PREVIEW_WIDTH / 8)).entries()) {
          Menu.Print(SETTINGS_PREVIEW_X, SETTINGS_PREVIEW_Y + SETTINGS_PREVIEW_WIDTH + 6 + lineIndex * CARD_LABEL_LINE_HEIGHT, line);
        }

        page.layout?.draw(page.items, page.cursor);
      },
    });

    startAction.action = () => {
      if (roundsCount !== oldRoundsCount) {
        engineAPI.SetCvar('hw_rounds', String(roundsCount));
      }

      if (isPrivateGame !== oldIsPrivateGame) {
        engineAPI.SetCvar('sv_public', isPrivateGame ? '0' : '1');
      }

      if (engineAPI.SV.active) {
        engineAPI.AppendConsoleText('disconnect\n');
      }
      Menu.ForceClose();
      Menu.StartMultiplayerGame(HellwaveMenu.#selectedMapName);
    };

    Menu.RegisterPage('hellwave_newgame_settings', settingsPage);

    return [startAction];
  }

  /**
   * Builds hellwave's main page and returns the sidebar's `Action`s so `Init()` can attach the
   * header font to them once it finishes loading (font loading and page construction happen
   * concurrently -- see `Init()`).
   * @returns The sidebar actions, in display order.
   */
  static #buildMainPage(engineAPI: ClientEngineAPI): Action[] {
    const { Menu } = engineAPI;
    const { Action, Label, MenuPage: MenuPageClass } = Menu;

    const openMapPicker = (): void => { Menu.Push('hellwave_newgame'); };

    const newGameAction = new Action({
      label: 'New Game',
      // Gated on having a confirmed profile first, per "setup a profile, if needed" --
      // plans/hellwave-main-menu-rework.md §6.
      action: () => {
        if (HellwaveMenu.#isProfileConfirmed(engineAPI)) {
          openMapPicker();
          return;
        }

        HellwaveMenu.#openProfile(engineAPI, { onAccept: openMapPicker, label: 'Continue' });
      },
    });
    const profileAction = new Action({
      label: 'Profile',
      action: () => { HellwaveMenu.#openProfile(engineAPI); },
    });
    const configureAction = new Action({ label: 'Options', action: () => { Menu.Push('options'); } });
    const quitAction = new Action({ label: 'Quit', action: () => { Menu.Push('quit'); } });

    const sidebarActions = [newGameAction, profileAction, configureAction, quitAction];
    const sidebarItems: MenuItem[] = sidebarActions;

    HellwaveMenu.#sidebarCount = sidebarItems.length;

    // The session list refresh below repopulates the array past this point on every fetch --
    // see the class doc above and #refreshSessions.
    const items: MenuItem[] = [...sidebarItems];

    const layout = {
      draw(rowItems: MenuItem[], focusedIndex: number): void {
        for (const [index, item] of rowItems.entries()) {
          if (!item.visible) {
            continue;
          }

          const { x, y } = HellwaveMenu.#rowPosition(index);
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

          const { x, y } = HellwaveMenu.#rowPosition(index);
          const xEnd = index < HellwaveMenu.#sidebarCount ? SESSIONS_X : 320;

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
      if (HellwaveMenu.#isProfileConfirmed(engineAPI)) {
        connect();
        return;
      }

      HellwaveMenu.#openProfile(engineAPI, { onAccept: connect, label: 'Continue' });
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
        mainPage.items.length = HellwaveMenu.#sidebarCount;
        mainPage.items.push(new Label({ label: 'Finding games...' }));
      }

      try {
        const sessions = await engineAPI.Multiplayer.ListSessions();

        // The sessionRefreshInFlight guard above rules out a concurrent call mutating
        // mainPage.items/hasLoadedSessionsOnce between this await and the assignments below.
        // eslint-disable-next-line require-atomic-updates
        mainPage.items.length = HellwaveMenu.#sidebarCount;

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
        mainPage.items.length = HellwaveMenu.#sidebarCount;
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
        HellwaveMenu.#drawLogo(engineAPI);

        const name = engineAPI.GetCvar('_cl_name')?.string ?? '';
        Menu.PrintWhite(320 - 8 - name.length * 8, 8, name);

        page.layout?.draw(page.items, page.cursor);
      },
    });

    Menu.RegisterPage('main', mainPage);

    return sidebarActions;
  }
}
