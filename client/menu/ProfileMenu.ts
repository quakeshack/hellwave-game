import type { Action, ClientEngineAPI, MenuPic } from '../../../../shared/GameInterfaces.ts';

import { cvarFlags } from '../../../../shared/Defs.ts';

import MenuCommon, { HEADER_FONT_GLYPH_HEIGHT } from './MenuCommon.ts';

const PROFILE_CONFIRMED_CVAR = 'hw_profile_confirmed';
const DEFAULT_ACCEPT_LABEL = 'Accept';

// Matches id1's multiplayer setup page's layout (see id1/client/Menu.ts's
// #buildMultiplayerPage): the name field's own input box and the bigbox/menuplyr preview share
// the same X column -- bigbox (72 wide) sits narrower than the name box (144 wide for a 16-cell
// textbox) at the same left edge, so the two don't need separate horizontal tuning to avoid
// colliding. FIELDS_START_Y is the Name/Vest/Pants column's own startY (kept in sync manually
// with the VerticalLayout config below); PREVIEW_Y mirrors id1's "8 units below the row start"
// relationship (its bigbox sits at rowY + 8).
const FIELDS_START_Y = 100;
const PREVIEW_Y = FIELDS_START_Y + 8;
// Content-block sizing for centering the whole "labels | name box" group within the page --
// LABEL_COLUMN_WIDTH is generous room for "Name"/"Vest"/"Pants", BOX_WIDTH matches the name
// textbox's own rendered width (16-cell box: 16 * 8 + 16, see M.DrawTextBox's tile math), and the
// gap between them is deliberate breathing room, not derived from anything else. The block's own
// left edge (and so labelX/previewX) is computed in build() from the *current* viewport width,
// so it stays centered regardless of viewport size.
const LABEL_COLUMN_WIDTH = 40;
const FIELD_GAP = 40;
const BOX_WIDTH = 144;
// menuplyr's fixed position *within* bigbox's own artwork (a 48x56 sprite centered inside a
// 72x72 frame, 12px side borders and 8px top/bottom borders) -- an intrinsic property of the two
// assets, not a layout choice, so it must stay exactly this regardless of viewport/scale.
const MENUPLYR_OFFSET_X = 12;
const MENUPLYR_OFFSET_Y = 8;

let bigboxPic: MenuPic = null!;
let menuplyrPic: MenuPic = null!;

/**
 * hellwave's profile page ('hellwave_profile'): name/color editing. Reused both as a standalone
 * sidebar destination and as a gate `MainMenu` inserts in front of "New Game"/joining a session
 * when no profile has been confirmed yet -- see `open()` and
 * plans/hellwave-main-menu-rework.md §3/§6.
 */
export default class ProfileMenu {
  // Configurable per-invocation state, set by open() right before pushing -- lets the same page
  // instance serve both as a standalone destination (default: just pop back) and as a gate step
  // inserted in front of another action (accept performs that action instead).
  static #onAccept: () => void = () => {};
  static #acceptLabel = DEFAULT_ACCEPT_LABEL;

  static isConfirmed(engineAPI: ClientEngineAPI): boolean {
    return engineAPI.GetCvar(PROFILE_CONFIRMED_CVAR)?.string === '1';
  }

  /**
   * Open the profile page, either as a plain standalone destination (defaults: pop back on
   * accept, "Accept" label) or as a gate in front of another action.
   */
  static open(engineAPI: ClientEngineAPI, options: { onAccept?: () => void; label?: string } = {}): void {
    ProfileMenu.#onAccept = options.onAccept ?? (() => { engineAPI.Menu.Pop(); });
    ProfileMenu.#acceptLabel = options.label ?? DEFAULT_ACCEPT_LABEL;
    engineAPI.Menu.Push('hellwave_profile');
  }

  /**
   * Registers 'hellwave_profile'.
   * @returns `[acceptAction]`, so `Menu.ts` can attach the header font to it once it finishes
   * loading.
   */
  static build(engineAPI: ClientEngineAPI): Action[] {
    const { Menu } = engineAPI;
    const { Action, ColorPicker, MenuPage: MenuPageClass, Textbox, VerticalLayout } = Menu;
    const viewport = MenuCommon.getViewport(engineAPI);

    const labelX = (viewport.width - (LABEL_COLUMN_WIDTH + FIELD_GAP + BOX_WIDTH)) / 2;
    const previewX = labelX + LABEL_COLUMN_WIDTH + FIELD_GAP;

    engineAPI.RegisterCvar(
      PROFILE_CONFIRMED_CVAR, '0', cvarFlags.ARCHIVE,
      'Whether the player has confirmed their hellwave profile (name/colors) at least once.',
    );

    bigboxPic = engineAPI.LoadPicFromLump('bigbox');
    // Placeholder until the async parse below replaces it -- matches id1's multiplayer page,
    // which needs the raw LMP-palette parse before DrawPicTranslate can use it correctly.
    menuplyrPic = engineAPI.LoadPicFromLump('menuplyr');
    engineAPI.Menu.LoadTranslatablePic('menuplyr').then((pic) => {
      menuplyrPic = pic;
    }).catch((error: Error) => {
      engineAPI.ConsoleError(`failed to load menuplyr translate texture: ${error.message}\n`);
    });

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

        Menu.Print(x, y, textbox.label);
        Menu.DrawTextBox(previewX, y - 8, textbox.width, 1);
        Menu.PrintWhite(previewX + 8, y, textbox.getValue());

        const glyph = textbox.getCursorGlyph();
        if (glyph !== null) {
          Menu.DrawCharacter(previewX + 8 + textbox.cursorPos * 8, y, glyph);
        }
      },
    });

    const acceptAction = new Action({ label: DEFAULT_ACCEPT_LABEL, heightOverride: HEADER_FONT_GLYPH_HEIGHT });

    // Name/Vest/Pants keep the stock field layout (reused directly, sliced to just those three
    // items); Accept/Continue is styled and positioned like the New Game settings page's Start
    // button -- same shared bottom-right corner -- instead of stacking as a fourth field. See
    // MenuCommon.buildTrailingActionLayout.
    const fieldsLayout = new VerticalLayout({ startY: FIELDS_START_Y, spacing: 0, labelX, cursorX: labelX - 15 });
    const profileLayout = MenuCommon.buildTrailingActionLayout(fieldsLayout, 3, viewport);

    const profilePage = new MenuPageClass({
      layout: profileLayout,
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
        acceptAction.label = ProfileMenu.#acceptLabel;
      },
      customDraw: (page) => {
        page.layout?.draw(page.items, page.cursor);

        Menu.DrawPic(previewX, PREVIEW_Y, bigboxPic);
        Menu.DrawPicTranslate(
          previewX + MENUPLYR_OFFSET_X, PREVIEW_Y + MENUPLYR_OFFSET_Y, menuplyrPic,
          (top << 4) + (top >= 8 ? 4 : 11),
          (bottom << 4) + (bottom >= 8 ? 4 : 11),
        );
      },
      viewport,
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
      ProfileMenu.#onAccept();
    };

    Menu.RegisterPage('hellwave_profile', profilePage);

    return [acceptAction];
  }
}
