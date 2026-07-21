import type { Action, ClientEngineAPI, MenuPic } from '../../../../shared/GameInterfaces.ts';

import { cvarFlags } from '../../../../shared/Defs.ts';

import MenuCommon, { HEADER_FONT_GLYPH_HEIGHT } from './MenuCommon.ts';

const PROFILE_CONFIRMED_CVAR = 'hw_profile_confirmed';
const DEFAULT_ACCEPT_LABEL = 'Accept';

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

    const acceptAction = new Action({ label: DEFAULT_ACCEPT_LABEL, heightOverride: HEADER_FONT_GLYPH_HEIGHT });

    // Name/Vest/Pants keep the stock field layout (reused directly, sliced to just those three
    // items); Accept/Continue is styled and positioned like the New Game settings page's Start
    // button -- same shared bottom-right corner -- instead of stacking as a fourth field. See
    // MenuCommon.buildTrailingActionLayout.
    const fieldsLayout = new VerticalLayout({ startY: 48, spacing: 0, labelX: 64, cursorX: 56 });
    const profileLayout = MenuCommon.buildTrailingActionLayout(fieldsLayout, 3);

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
      ProfileMenu.#onAccept();
    };

    Menu.RegisterPage('hellwave_profile', profilePage);

    return [acceptAction];
  }
}
