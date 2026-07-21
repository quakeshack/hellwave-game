import type { BitmapFont, ClientEngineAPI, MenuItem } from '../../../../shared/GameInterfaces.ts';

// Generic wrapped small-text line height (virtual menu-space units) -- shared by the map picker's
// card labels (NewGameMenu) and the new-game settings screen's selected-map label
// (NewGameSettingsMenu), both of which reuse MenuCommon.wrapLabel.
export const LABEL_LINE_HEIGHT = 8;

// Shared header-font glyph height -- ties together Menu.ts's LoadBitmapFont config and the
// heightOverride ProfileMenu/NewGameSettingsMenu give their own trailing action button, so all
// three stay in lockstep with the actual atlas.
export const HEADER_FONT_GLYPH_HEIGHT = 16;

// Shared bottom-right corner for a page's single primary call-to-action button (New Game
// settings' "Start!", the profile page's "Continue"/"Accept") -- styled like the main menu's
// sidebar items (header font, hover-color focus feedback) and pinned to the bottom-right rather
// than stacked in with the rest of the page's fields, mirroring the page-agnostic Back button's
// bottom-left corner, with the same 16px margin from the right edge the sidebar/logo use on the
// left.
const BOTTOM_RIGHT_BUTTON_X = 304;
const BOTTOM_RIGHT_BUTTON_Y = 216;

/**
 * The shape `MenuPage.layout` expects (draw/hit-test against a page's `items`) -- declared
 * locally rather than imported from the engine's `MenuPage.ts`, since game code only depends on
 * `ClientEngineAPI`/`GameInterfaces.ts`, never engine internals directly.
 */
export interface RowLayout {
  draw(items: MenuItem[], focusedIndex: number): void;
  hitTest(items: MenuItem[], px: number, py: number): number | null;
}

/**
 * Small, stateless helpers shared by 2+ hellwave menu pages -- kept separate from any one page's
 * own file so it's obvious at a glance which bits are genuinely cross-cutting versus page-specific.
 */
export default class MenuCommon {
  // Set once by Menu.ts's Init() after `gfx/header-font.png` finishes loading; read by
  // buildTrailingActionLayout to measure a trailing button's label width for right-alignment.
  static #font: BitmapFont | null = null;

  static setFont(font: BitmapFont): void {
    MenuCommon.#font = font;
  }

  /**
   * Convert a virtual menu-space (320x200) point into the real, resolution-aware screen pixel
   * `engineAPI.DrawPic` expects -- the same transform `M.DrawPic` uses internally
   * (`cx * 2 + VID.width / 2 - 320`). Needed whenever a picture has to be drawn through the
   * top-level `DrawPic` (explicit scale) instead of `Menu.DrawPic` (always native-pixel size).
   * @returns The equivalent real screen position.
   */
  static toScreenPosition(engineAPI: ClientEngineAPI, x: number, y: number): { x: number; y: number } {
    const { VID } = engineAPI;

    return { x: x * 2 + Math.floor(VID.width / 2) - 320, y: y * 2 + Math.floor(VID.height / 2) - 200 };
  }

  /**
   * Greedily wrap `label` onto up to two lines, each clamped to `maxChars` -- map labels
   * ("Doomed computer station") can be longer than a single card is wide.
   * @returns One or two lines, each at most `maxChars` long.
   */
  static wrapLabel(label: string, maxChars: number): string[] {
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
   * Build a `RowLayout` for pages shaped like "a stock `VerticalLayout` of `fieldCount` fields,
   * followed by one primary call-to-action button pinned to the shared bottom-right corner" --
   * used by both the New Game settings page (Rounds/Private Game + Start) and the profile page
   * (Name/Vest/Pants + Continue/Accept). The button is measured with the loaded header font
   * (once set via `setFont`) so it can be right-aligned against its own label width, matching the
   * sidebar's header-font styling.
   * @returns A layout usable directly as `MenuPage`'s `layout`.
   */
  static buildTrailingActionLayout(fieldsLayout: RowLayout, fieldCount: number): RowLayout {
    return {
      draw(rowItems: MenuItem[], focusedIndex: number): void {
        fieldsLayout.draw(rowItems.slice(0, fieldCount), focusedIndex);

        const button = rowItems[fieldCount];
        const buttonWidth = MenuCommon.#font?.measure(button.label) ?? button.label.length * 8;
        const buttonX = BOTTOM_RIGHT_BUTTON_X - buttonWidth;
        button.draw(buttonX, BOTTOM_RIGHT_BUTTON_Y, focusedIndex === fieldCount);
      },
      hitTest(rowItems: MenuItem[], px: number, py: number): number | null {
        const fieldsHit = fieldsLayout.hitTest(rowItems.slice(0, fieldCount), px, py);
        if (fieldsHit !== null) {
          return fieldsHit;
        }

        const button = rowItems[fieldCount];
        const buttonWidth = MenuCommon.#font?.measure(button.label) ?? button.label.length * 8;
        const buttonX = BOTTOM_RIGHT_BUTTON_X - buttonWidth;

        if (
          button.focusable && px >= buttonX && px < buttonX + buttonWidth
          && py >= BOTTOM_RIGHT_BUTTON_Y && py < BOTTOM_RIGHT_BUTTON_Y + button.getHeight()
        ) {
          return fieldCount;
        }

        return null;
      },
    };
  }
}
