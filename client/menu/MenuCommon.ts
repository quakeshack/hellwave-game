import type { BitmapFont, ClientEngineAPI, MenuItem, MenuViewport } from '../../../../shared/GameInterfaces.ts';

// Generic wrapped small-text line height (virtual menu-space units) -- shared by the map picker's
// card labels (NewGameMenu) and the new-game settings screen's selected-map label
// (NewGameSettingsMenu), both of which reuse MenuCommon.wrapLabel.
export const LABEL_LINE_HEIGHT = 8;

// Shared header-font glyph height -- ties together Menu.ts's LoadBitmapFont config and the
// heightOverride ProfileMenu/NewGameSettingsMenu give their own trailing action button, so all
// three stay in lockstep with the actual atlas.
export const HEADER_FONT_GLYPH_HEIGHT = 16;

// hellwave's own virtual menu-space, replacing the classic 320x200 inherited from id1 for every
// page hellwave owns (see plans/menu-virtual-resolution.md) -- wide enough for the sidebar +
// live session list composition without letterboxing on a modern widescreen display. 'contain'
// (not integer-scaled) since hellwave's art is smooth hi-res PNG/JPG, not palette-indexed pixel
// art, so there's no nearest-neighbor crispness to protect.
//
// Deliberately *not* 1280x720: at a real browser window size, 1280x720 lands so close to 1:1
// (VID pixels : virtual units) that text/logos rendered at their native virtual-unit size came
// out roughly native-texture-pixel-for-pixel -- legible, but small relative to how much of the
// screen the layout itself claims. Every page's own position/spacing constants below are halved
// to match, so on-screen *positions* are unchanged from the 1280x720 pass; only the *content*
// drawn at each position (conchars/header-font text, the hi-res logo) renders at ~2x pixel size,
// since those draw calls scale with the viewport's resolved scale, not with a page's own
// constants.
export const VIEWPORT_WIDTH = 640;
export const VIEWPORT_HEIGHT = 360;

// Shared corner margin for a page's single primary call-to-action button (New Game settings'
// "Start!", the profile page's "Continue"/"Accept") -- styled like the main menu's sidebar items
// (header font, hover-color focus feedback) and pinned to the bottom-right rather than stacked in
// with the rest of the page's fields, mirroring the page-agnostic Back button's bottom-left
// corner. Position itself is derived per page via `MenuCommon.getViewport(engineAPI).anchor(...)`
// instead of a hand-tuned absolute constant.
const BOTTOM_RIGHT_BUTTON_MARGIN = 8;

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

  // Shared by every hellwave-owned page (main/newgame/newgame_settings/profile/buy) so they all
  // draw in the same virtual space -- built lazily since it needs an engineAPI reference.
  static #viewport: MenuViewport | null = null;

  static setFont(font: BitmapFont): void {
    MenuCommon.#font = font;
  }

  /**
   * hellwave's shared virtual menu-space (see `VIEWPORT_WIDTH`/`VIEWPORT_HEIGHT`), constructed
   * once on first use. Pass this as `viewport` when registering any hellwave-owned page.
   * @returns The shared viewport.
   */
  static getViewport(engineAPI: ClientEngineAPI): MenuViewport {
    if (MenuCommon.#viewport === null) {
      MenuCommon.#viewport = new engineAPI.Menu.MenuViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT, fit: 'contain' });
    }

    return MenuCommon.#viewport;
  }

  /**
   * Convert a virtual menu-space point (in hellwave's own viewport) into the real,
   * resolution-aware screen pixel `engineAPI.DrawPic` expects. Needed whenever a picture has to
   * be drawn through the top-level `DrawPic` (explicit scale) instead of `Menu.DrawPic` (always
   * native-pixel size).
   * @returns The equivalent real screen position.
   */
  static toScreenPosition(engineAPI: ClientEngineAPI, x: number, y: number): { x: number; y: number } {
    return engineAPI.Menu.toScreenPosition(x, y);
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
   * sidebar's header-font styling. The corner position itself comes from `viewport.anchor()`
   * (see `MenuViewport`) instead of a hand-tuned absolute constant.
   * @returns A layout usable directly as `MenuPage`'s `layout`.
   */
  static buildTrailingActionLayout(fieldsLayout: RowLayout, fieldCount: number, viewport: MenuViewport): RowLayout {
    const buttonAnchor = (buttonWidth: number): { x: number; y: number } => (
      viewport.anchor('bottom-right', buttonWidth, HEADER_FONT_GLYPH_HEIGHT, BOTTOM_RIGHT_BUTTON_MARGIN, BOTTOM_RIGHT_BUTTON_MARGIN)
    );

    return {
      draw(rowItems: MenuItem[], focusedIndex: number): void {
        fieldsLayout.draw(rowItems.slice(0, fieldCount), focusedIndex);

        const button = rowItems[fieldCount];
        const buttonWidth = MenuCommon.#font?.measure(button.label) ?? button.label.length * 8;
        const { x, y } = buttonAnchor(buttonWidth);
        button.draw(x, y, focusedIndex === fieldCount);
      },
      hitTest(rowItems: MenuItem[], px: number, py: number): number | null {
        const fieldsHit = fieldsLayout.hitTest(rowItems.slice(0, fieldCount), px, py);
        if (fieldsHit !== null) {
          return fieldsHit;
        }

        const button = rowItems[fieldCount];
        const buttonWidth = MenuCommon.#font?.measure(button.label) ?? button.label.length * 8;
        const { x, y } = buttonAnchor(buttonWidth);

        if (
          button.focusable && px >= x && px < x + buttonWidth
          && py >= y && py < y + button.getHeight()
        ) {
          return fieldCount;
        }

        return null;
      },
    };
  }
}
