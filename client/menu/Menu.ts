import type { ClientEngineAPI } from '../../../../shared/GameInterfaces.ts';

import MainMenu from './MainMenu.ts';
import MenuCommon, { HEADER_FONT_GLYPH_HEIGHT } from './MenuCommon.ts';
import NewGameMenu from './NewGameMenu.ts';
import NewGameSettingsMenu from './NewGameSettingsMenu.ts';
import ProfileMenu from './ProfileMenu.ts';

// Sidebar main-menu items ("New Game"/"Profile"/"Configure"/"Quit") are drawn with LibreQuake's
// stylized header font instead of the standard conchars font -- see `MainMenu.build()`. The atlas
// is uppercase-only (26 letters, no digits/punctuation), which is exactly why it's deliberately
// not used for the dynamic session list below the sidebar (entries like "e1m1 [3/8]" need digits
// and brackets the font doesn't have).
const HEADER_FONT_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const HEADER_FONT_GLYPH_WIDTH = 12;
const HEADER_FONT_CELL_WIDTH = 14;
const HEADER_FONT_CELL_HEIGHT = 18;

/**
 * hellwave's own menu front end, replacing id1's inherited classic single-player pages (see
 * `plans/hellwave-main-menu-rework.md`). A thin composition root: each page lives in its own
 * class (`MainMenu`, `ProfileMenu`, `NewGameMenu`, `NewGameSettingsMenu`), owns its own state and
 * assets, and registers itself; this class just orders that construction, claims the root page,
 * and attaches the shared header font to every page's actions once it loads.
 */
export default class HellwaveMenu {
  static Init(engineAPI: ClientEngineAPI): void {
    const profileActions = ProfileMenu.build(engineAPI);
    NewGameMenu.build(engineAPI);
    const settingsActions = NewGameSettingsMenu.build(engineAPI);
    const sidebarActions = MainMenu.build(engineAPI);

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
      MenuCommon.setFont(font);
      for (const action of [...sidebarActions, ...settingsActions, ...profileActions]) {
        action.font = font;
      }
    }).catch(() => {
      engineAPI.ConsoleWarning('Couldn\'t load hellwave menu header font.\n');
    });
  }
}
