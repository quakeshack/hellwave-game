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
// Quiet Time bounds/default mirror hw_quiet_time's own registered range/default
// (ServerGameAPI.Init, "Minimum 30, maximum 120") -- same manual-sync rationale as Rounds above.
const QUIET_TIME_MIN = 30;
const QUIET_TIME_MAX = 120;
const QUIET_TIME_DEFAULT = 90;
// Max Players' own upper bound is the selected map's capacity (NewGameMenu.getSelectedMapMaxPlayers,
// set from MapDetails.maxplayers), applied to the NumberInput's `max` field in onEnter -- unlike
// Rounds/Quiet Time/Private Game, this field's valid range depends on which map was picked.
const MAX_PLAYERS_MIN = 2;
const SETTINGS_PREVIEW_Y = 70;
const SETTINGS_PREVIEW_WIDTH = 140;
// Content-block sizing for centering the whole "map preview | Rounds/Private Game fields" group
// within the page. FIELDS_COLUMN_WIDTH is the label column's own value offset (`VerticalLayout`'s
// default `x + 116` a field without an explicit valueX draws its value at, see MenuItem.ts) plus
// room for the widest value text ("yes"/"no"/a 3-digit quiet-time count). The block's own left edge
// (and so previewX/fieldsLabelX) is computed in build() from the *current* viewport width, so it
// stays centered regardless of viewport size.
const PREVIEW_GAP = 40;
const FIELDS_COLUMN_WIDTH = 116 + 32;

/**
 * The per-map settings screen picking a card leads to ('hellwave_newgame_settings'): rounds
 * count, max players, quiet time, and public/private, then Start.
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
   * Registers 'hellwave_newgame_settings'. `hw_rounds`/`hw_maxplayers`/`hw_quiet_time`/`sv_public`
   * are read on `onEnter` and only committed (via `SetCvar`) if actually changed, same
   * load-then-commit shape as the profile page -- deliberately *not* a cvar-bound
   * `Slider`/`Toggle`, since those read/write the real engine `Cvar` registry directly rather than
   * through `engineAPI`, which would be both untestable here (this file's tests use
   * `engineAPI.GetCvar`/`SetCvar` mocks, not the real registry) and, for
   * `hw_rounds`/`hw_maxplayers`/`hw_quiet_time` specifically, moot before `ServerGameAPI.Init()`
   * has ever registered them. `NumberInput` (rather than `ColorPicker`, used for the same
   * "closure-backed numeric field" shape before it existed) clamps at `ROUNDS_MIN`/`ROUNDS_MAX`
   * (and, for Max Players, `MAX_PLAYERS_MIN`/the selected map's own capacity; for Quiet Time,
   * `QUIET_TIME_MIN`/`QUIET_TIME_MAX`) instead of wrapping, and draws the value itself instead of
   * it being baked into the label string. `hw_maxplayers` itself is only consumed downstream by
   * `StartGameHandler.startMultiplayerGame` (`ClientAPI.ts`), which reads it to build the
   * `maxplayers` console command sent right before `map` -- it has no other server-side meaning.
   * Starting always goes through `Menu.StartMultiplayerGame` -- hellwave has no real singleplayer
   * mode, so "New Game" hosts a (possibly solo) multiplayer/coop session either way. Start is
   * styled like the main menu's sidebar items (header font, hover-color focus feedback) and
   * pinned to the bottom-right corner rather than stacked in the Rounds/Max Players/Quiet
   * Time/Private Game fields column, so it needs its own custom layout instead of a single stock
   * `VerticalLayout` for all five items.
   * @returns `[startAction]`, so `Menu.ts` can attach the header font to it once it finishes
   * loading.
   */
  static build(engineAPI: ClientEngineAPI): Action[] {
    const { Menu } = engineAPI;
    const { Action, MenuPage: MenuPageClass, NumberInput, Toggle, VerticalLayout } = Menu;
    const viewport = MenuCommon.getViewport(engineAPI);

    const previewX = (viewport.width - (SETTINGS_PREVIEW_WIDTH + PREVIEW_GAP + FIELDS_COLUMN_WIDTH)) / 2;
    const fieldsLabelX = previewX + SETTINGS_PREVIEW_WIDTH + PREVIEW_GAP;

    let roundsCount = ROUNDS_DEFAULT;
    let oldRoundsCount = ROUNDS_DEFAULT;
    let isPrivateGame = false;
    let oldIsPrivateGame = false;
    let maxPlayersCount = MAX_PLAYERS_MIN;
    let oldMaxPlayersCount = MAX_PLAYERS_MIN;
    let quietTimeCount = QUIET_TIME_DEFAULT;
    let oldQuietTimeCount = QUIET_TIME_DEFAULT;

    const roundsInput = new NumberInput({
      label: 'Rounds',
      min: ROUNDS_MIN,
      max: ROUNDS_MAX,
      getValue: () => roundsCount,
      setValue: (value) => { roundsCount = value; },
    });

    // `max` is overwritten every onEnter with the selected map's own capacity
    // (NewGameMenu.getSelectedMapMaxPlayers) -- the placeholder here only matters until then.
    const maxPlayersInput = new NumberInput({
      label: 'Max Players',
      min: MAX_PLAYERS_MIN,
      max: MAX_PLAYERS_MIN,
      getValue: () => maxPlayersCount,
      setValue: (value) => { maxPlayersCount = value; },
    });

    const quietTimeInput = new NumberInput({
      label: 'Quiet Seconds',
      min: QUIET_TIME_MIN,
      max: QUIET_TIME_MAX,
      getValue: () => quietTimeCount,
      setValue: (value) => { quietTimeCount = value; },
    });

    const privateToggle = new Toggle({
      label: 'Private Game',
      getValue: () => (isPrivateGame ? 1 : 0),
      setValue: (value) => { isPrivateGame = value === 1; },
      onLabel: 'yes',
      offLabel: 'no',
    });

    const startAction = new Action({ label: 'Start!', heightOverride: HEADER_FONT_GLYPH_HEIGHT });

    // Rounds/Max Players/Quiet Time/Private Game keep the stock two-column field layout (reused
    // directly, sliced to just those four items); Start is measured (once the header font has
    // loaded) and right-aligned separately below instead of being a fifth stacked field -- see
    // MenuCommon.buildTrailingActionLayout.
    const fieldsLayout = new VerticalLayout({ startY: 170, spacing: 12, labelX: fieldsLabelX, cursorX: fieldsLabelX - 12 });
    const settingsLayout = MenuCommon.buildTrailingActionLayout(fieldsLayout, 4, viewport);

    const settingsPage = new MenuPageClass({
      title: 'New Game',
      layout: settingsLayout,
      items: [roundsInput, maxPlayersInput, quietTimeInput, privateToggle, startAction],
      onEscape: () => { Menu.Pop(); },
      onEnter: () => {
        roundsCount = oldRoundsCount = engineAPI.GetCvar('hw_rounds')?.value ?? ROUNDS_DEFAULT;
        isPrivateGame = oldIsPrivateGame = (engineAPI.GetCvar('sv_public')?.value ?? 1) === 0;
        quietTimeCount = oldQuietTimeCount = engineAPI.GetCvar('hw_quiet_time')?.value ?? QUIET_TIME_DEFAULT;

        const mapMaxPlayers = Math.max(MAX_PLAYERS_MIN, NewGameMenu.getSelectedMapMaxPlayers());
        maxPlayersInput.max = mapMaxPlayers;
        const storedMaxPlayers = engineAPI.GetCvar('hw_maxplayers')?.value ?? mapMaxPlayers;
        maxPlayersCount = oldMaxPlayersCount = Math.min(Math.max(storedMaxPlayers, MAX_PLAYERS_MIN), mapMaxPlayers);
      },
      customDraw: (page) => {
        const picture = NewGameMenu.getMapPicture(NewGameMenu.getSelectedMapName());

        if (picture) {
          const scale = (SETTINGS_PREVIEW_WIDTH * engineAPI.Menu.viewportScale) / picture.width;
          const { x, y } = MenuCommon.toScreenPosition(engineAPI, previewX, SETTINGS_PREVIEW_Y);
          engineAPI.DrawPic(x, y, picture, scale);
        }

        for (const [lineIndex, line] of MenuCommon.wrapLabel(NewGameMenu.getSelectedMapLabel(), Math.floor(SETTINGS_PREVIEW_WIDTH / 8)).entries()) {
          const labelX = MenuCommon.centerX(previewX, SETTINGS_PREVIEW_WIDTH, line.length * 8);
          Menu.Print(labelX, SETTINGS_PREVIEW_Y + SETTINGS_PREVIEW_WIDTH + 6 + lineIndex * LABEL_LINE_HEIGHT, line);
        }

        page.layout?.draw(page.items, page.cursor);
      },
      viewport,
    });

    startAction.action = () => {
      if (roundsCount !== oldRoundsCount) {
        engineAPI.SetCvar('hw_rounds', String(roundsCount));
      }

      if (isPrivateGame !== oldIsPrivateGame) {
        engineAPI.SetCvar('sv_public', isPrivateGame ? '0' : '1');
      }

      if (maxPlayersCount !== oldMaxPlayersCount) {
        engineAPI.SetCvar('hw_maxplayers', String(maxPlayersCount));
      }

      if (quietTimeCount !== oldQuietTimeCount) {
        engineAPI.SetCvar('hw_quiet_time', String(quietTimeCount));
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
