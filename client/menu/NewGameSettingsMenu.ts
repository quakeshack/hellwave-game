import type { Action, ClientEngineAPI } from '../../../../shared/GameInterfaces.ts';

import MenuCommon, { HEADER_FONT_GLYPH_HEIGHT, LABEL_LINE_HEIGHT } from './MenuCommon.ts';
import NewGameMenu from './NewGameMenu.ts';

// New-game settings screen: rounds bounds match hw_rounds's own registered range/default
// (ServerGameAPI.Init, "Minimum 2, maximum 12") -- kept in sync manually since the Rounds
// stepper reads/writes through engineAPI rather than binding to that cvar live (see build() for
// why).
const ROUNDS_MIN = 2;
const ROUNDS_MAX = 12;
const ROUNDS_DEFAULT = 10;
const SETTINGS_PREVIEW_X = 20;
const SETTINGS_PREVIEW_Y = 40;
const SETTINGS_PREVIEW_WIDTH = 80;
const SETTINGS_FIELDS_LABEL_X = 160;

/**
 * The per-map settings screen picking a card leads to ('hellwave_newgame_settings'): rounds
 * count and public/private, then Start.
 */
export default class NewGameSettingsMenu {
  /**
   * Build the hostname `Start!` commits to the server -- derived from the player's profile name
   * (`_cl_name`) rather than left for `SV.SpawnServer`'s own empty-string fallback, so a session
   * is identifiable by its host before anyone even joins. Falls back to the same `'UNNAMED'`
   * default `SV.SpawnServer`/`NET.hostname` already use if the profile name is empty or
   * whitespace-only -- reachable via the Profile page's name textbox, which has no non-empty
   * validator.
   * @returns The hostname to commit.
   */
  static #buildHostname(profileName: string): string {
    const trimmedName = profileName.trim();

    return trimmedName === '' ? 'UNNAMED' : `${trimmedName}'s game`;
  }

  /**
   * Registers 'hellwave_newgame_settings'. `hw_rounds`/`sv_public` are read on `onEnter` and only
   * committed (via `SetCvar`) if actually changed, same load-then-commit shape as the profile
   * page -- deliberately *not* a cvar-bound `Slider`/`Toggle`, since those read/write the real
   * engine `Cvar` registry directly rather than through `engineAPI`, which would be both
   * untestable here (this file's tests use `engineAPI.GetCvar`/`SetCvar` mocks, not the real
   * registry) and, for `hw_rounds` specifically, moot before `ServerGameAPI.Init()` has ever
   * registered it. `NumberInput` (rather than `ColorPicker`, used for the same "closure-backed
   * numeric field" shape before it existed) clamps at `ROUNDS_MIN`/`ROUNDS_MAX` instead of
   * wrapping, and draws the rounds count itself instead of it being baked into the label string.
   * Starting always goes through `Menu.StartMultiplayerGame` -- hellwave has no real singleplayer
   * mode, so "New Game" hosts a (possibly solo) multiplayer/coop session either way. Start is
   * styled like the main menu's sidebar items (header font, hover-color focus feedback) and
   * pinned to the bottom-right corner rather than stacked in the Rounds/Private Game fields
   * column, so it needs its own custom layout instead of a single stock `VerticalLayout` for all
   * three items.
   * @returns `[startAction]`, so `Menu.ts` can attach the header font to it once it finishes
   * loading.
   */
  static build(engineAPI: ClientEngineAPI): Action[] {
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
    // separately below instead of being a third stacked field -- see
    // MenuCommon.buildTrailingActionLayout.
    const fieldsLayout = new VerticalLayout({ startY: 100, spacing: 8, labelX: SETTINGS_FIELDS_LABEL_X, cursorX: SETTINGS_FIELDS_LABEL_X - 12 });
    const settingsLayout = MenuCommon.buildTrailingActionLayout(fieldsLayout, 2);

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
        const picture = NewGameMenu.getMapPicture(NewGameMenu.getSelectedMapName());

        if (picture) {
          const scale = (SETTINGS_PREVIEW_WIDTH * 2) / picture.width;
          const { x, y } = MenuCommon.toScreenPosition(engineAPI, SETTINGS_PREVIEW_X, SETTINGS_PREVIEW_Y);
          engineAPI.DrawPic(x, y, picture, scale);
        }

        for (const [lineIndex, line] of MenuCommon.wrapLabel(NewGameMenu.getSelectedMapLabel(), Math.floor(SETTINGS_PREVIEW_WIDTH / 8)).entries()) {
          Menu.Print(SETTINGS_PREVIEW_X, SETTINGS_PREVIEW_Y + SETTINGS_PREVIEW_WIDTH + 6 + lineIndex * LABEL_LINE_HEIGHT, line);
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

      const profileName = engineAPI.GetCvar('_cl_name')?.string ?? '';
      engineAPI.SetCvar('hostname', NewGameSettingsMenu.#buildHostname(profileName));

      if (engineAPI.SV.active) {
        engineAPI.AppendConsoleText('disconnect\n');
      }
      Menu.ForceClose();
      Menu.StartMultiplayerGame(NewGameMenu.getSelectedMapName());
    };

    Menu.RegisterPage('hellwave_newgame_settings', settingsPage);

    return [startAction];
  }
}
