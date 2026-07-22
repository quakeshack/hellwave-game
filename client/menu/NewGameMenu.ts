import type { ClientEngineAPI, GLTexture, MenuItem } from '../../../../shared/GameInterfaces.ts';

import Vector from '../../../../shared/Vector.ts';
import { ServerGameAPI } from '../../GameAPI.ts';

import MenuCommon, { LABEL_LINE_HEIGHT } from './MenuCommon.ts';

// Map-picker card layout (virtual menu-space units). Screenshots are square, so card height
// equals CARD_WIDTH. Map labels ("Doomed computer station") are long enough that they can
// overflow a single line at this width -- see MenuCommon.wrapLabel -- so labels get up to two
// lines below the card, each independently width-clamped to CARD_WIDTH.
const CARD_WIDTH = 140;
const CARD_GAP = 30;
const CARDS_START_Y = 70;
const CARD_LABEL_Y = CARDS_START_Y + CARD_WIDTH + 6;
// Border drawn around the focused card, in the same light-blue the header font's hover/focused
// row (variant 0) uses -- sampled from gfx/header-font.png so the two focus cues visually match.
const CARD_HOVER_BORDER_COLOR = new Vector(0.733, 0.733, 0.733); // new Vector(171 / 255, 231 / 255, 255 / 255);
const CARD_HOVER_BORDER_THICKNESS = 1;

/**
 * The "select a map" screen New Game leads to ('hellwave_newgame'): one card per curated map
 * (screenshot + name, `ServerGameAPI.GetMapList()`). Picking a card opens the per-map settings
 * screen (`NewGameSettingsMenu`), not this class -- built on `ListPage` rather than plain
 * `MenuPage` so Left/Right (not just Up/Down) move between the side-by-side cards, matching the
 * original sketch's annotation for exactly that.
 */
export default class NewGameMenu {
  // Shared with NewGameSettingsMenu, which draws whichever card was picked -- set right before
  // pushing 'hellwave_newgame_settings' in the card's own action.
  static #mapPictures = new Map<string, GLTexture>();
  static #selectedMapName = '';
  static #selectedMapLabel = '';

  static getSelectedMapName(): string {
    return NewGameMenu.#selectedMapName;
  }

  static getSelectedMapLabel(): string {
    return NewGameMenu.#selectedMapLabel;
  }

  static getMapPicture(name: string): GLTexture | undefined {
    return NewGameMenu.#mapPictures.get(name);
  }

  /**
   * Draw a hollow border (four thin filled rects, not a filled box) around a virtual-space
   * rectangle -- used to highlight the focused map card.
   */
  static #drawHoverBorder(engineAPI: ClientEngineAPI, x: number, y: number, width: number, height: number): void {
    const t = CARD_HOVER_BORDER_THICKNESS;
    const scale = engineAPI.Menu.viewportScale;
    const { x: screenX, y: screenY } = MenuCommon.toScreenPosition(engineAPI, x - t, y - t);
    const screenWidth = (width + t * 2) * scale;
    const screenHeight = (height + t * 2) * scale;
    const screenThickness = t * scale;

    engineAPI.DrawRect(screenX, screenY, screenWidth, screenThickness, CARD_HOVER_BORDER_COLOR); // top
    engineAPI.DrawRect(screenX, screenY + screenHeight - screenThickness, screenWidth, screenThickness, CARD_HOVER_BORDER_COLOR); // bottom
    engineAPI.DrawRect(screenX, screenY, screenThickness, screenHeight, CARD_HOVER_BORDER_COLOR); // left
    engineAPI.DrawRect(screenX + screenWidth - screenThickness, screenY, screenThickness, screenHeight, CARD_HOVER_BORDER_COLOR); // right
  }

  /**
   * Registers 'hellwave_newgame'.
   */
  static build(engineAPI: ClientEngineAPI): void {
    const { Menu } = engineAPI;
    const { Action, ListPage } = Menu;
    const viewport = MenuCommon.getViewport(engineAPI);

    const maps = ServerGameAPI.GetMapList() ?? [];

    for (const map of maps) {
      const picturePath = map.pictures[0];
      if (picturePath === undefined) {
        continue;
      }

      engineAPI.LoadPicFromFile(picturePath).then((texture: GLTexture): void => {
        texture.lockTextureMode('GL_LINEAR');
        NewGameMenu.#mapPictures.set(map.name, texture);
      }).catch((): void => {
        engineAPI.ConsoleWarning(`Couldn't load map picture for ${map.name}.\n`);
      });
    }

    const items: MenuItem[] = maps.map((map) => new Action({
      label: map.label,
      action: () => {
        NewGameMenu.#selectedMapName = map.name;
        NewGameMenu.#selectedMapLabel = map.label;
        Menu.Push('hellwave_newgame_settings');
      },
    }));

    const cardsStartX = (viewport.width - (maps.length * CARD_WIDTH + Math.max(0, maps.length - 1) * CARD_GAP)) / 2;

    const layout = {
      draw(rowItems: MenuItem[], focusedIndex: number): void {
        rowItems.forEach((item, index) => {
          const x = cardsStartX + index * (CARD_WIDTH + CARD_GAP);
          const picture = NewGameMenu.#mapPictures.get(maps[index].name);

          if (picture) {
            const scale = (CARD_WIDTH * engineAPI.Menu.viewportScale) / picture.width;
            const { x: screenX, y: screenY } = MenuCommon.toScreenPosition(engineAPI, x, CARDS_START_Y);
            engineAPI.DrawPic(screenX, screenY, picture, scale);
          } else {
            Menu.Print(x, CARDS_START_Y + CARD_WIDTH / 2, 'Loading...');
          }

          if (index === focusedIndex) {
            NewGameMenu.#drawHoverBorder(engineAPI, x, CARDS_START_Y, CARD_WIDTH, CARD_WIDTH);
          }

          const lines = MenuCommon.wrapLabel(item.label, Math.floor(CARD_WIDTH / 8));
          lines.forEach((line, lineIndex) => {
            const labelX = x + Math.max(0, (CARD_WIDTH - line.length * 8) / 2);
            const labelY = CARD_LABEL_Y + lineIndex * LABEL_LINE_HEIGHT;

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
          const lineCount = MenuCommon.wrapLabel(item.label, Math.floor(CARD_WIDTH / 8)).length;
          const cardBottom = CARD_LABEL_Y + lineCount * LABEL_LINE_HEIGHT;

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
      viewport,
    });

    Menu.RegisterPage('hellwave_newgame', newGamePage);
  }
}
