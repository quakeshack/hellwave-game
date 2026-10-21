import assert from 'node:assert/strict';

import type { ClientEngineAPI } from '../../../../../shared/GameInterfaces.ts';
import { Action, type MenuItem } from '../../../../../engine/client/menu/MenuItem.ts';
import type { MenuPage } from '../../../../../engine/client/menu/MenuPage.ts';
import { asClientEngineAPI, createMockClientEngine, createMockMenuAPI, createMockSessionsChannel } from '../../../../id1/test/client/fixtures.ts';

export { createMockSessionsChannel };

type Widget<T extends MenuItem> = abstract new (...args: never[]) => T;

/**
 * Reads an item of a page as the widget it is.
 * @param page The page.
 * @param index Where the item is in the page, negative from the end.
 * @param WidgetClass The widget class the item is an instance of.
 * @returns The item.
 */
export function itemAt<T extends MenuItem>(page: MenuPage, index: number, WidgetClass: Widget<T>): T {
  const item = page.items.at(index);
  assert.ok(item instanceof WidgetClass, `item ${index} of the page is a ${WidgetClass.name}`);
  return item;
}

/**
 * Activates the action item of a page, the way a click on it does.
 * @param page The page.
 * @param index Where the item is in the page, negative from the end.
 */
export function pressItem(page: MenuPage, index: number): void {
  void itemAt(page, index, Action).action();
}

/**
 * The layout of a page.
 * @param page The page.
 * @returns Its layout, which the pages of the menu always have.
 */
export function layoutOf(page: MenuPage): NonNullable<MenuPage['layout']> {
  assert.ok(page.layout, 'the page has a layout');
  return page.layout;
}

export interface MainMenuRigCalls {
  readonly push: string[];
  pop: number;
  forceClose: number;
  readonly startMultiplayerGame: string[];
}

/**
 * Create a rig for `HellwaveMenu`, capturing the registered `'main'`/`'hellwave_profile'`/
 * `'hellwave_newgame'`/`'hellwave_newgame_settings'` pages and tracking calls to the menu
 * actions the mock stub (`createMockMenuAPI()`) doesn't record on its own
 * (`Push`/`Pop`/`ForceClose`/`StartMultiplayerGame`).
 * @param HellwaveMenu The `HellwaveMenu` orchestrator class -- passed in rather than
 * imported here so each test file controls its own dynamic-import ordering relative to the
 * `id1/GameAPI.ts` bootstrap (see the game-logic-port porting guide's note on ESM
 * circular-dependency ordering in tests).
 * @param HellwaveMenu.Init Registers the pages against an engine.
 * @param engineOverrides Additional overrides merged into the mock engine (besides `Menu`, which this rig owns) -- e.g. `{ Multiplayer: { ListSessions: async () => [...] } }`.
 * @returns Test rig.
 */
export function createMainMenuRig(HellwaveMenu: { Init(engineAPI: ClientEngineAPI): void }, engineOverrides: Parameters<typeof createMockClientEngine>[0] = {}) {
  const realMenuAPI = createMockMenuAPI();
  let mainPage: MenuPage | null = null;
  let profilePage: MenuPage | null = null;
  let newGamePage: MenuPage | null = null;
  let newGameSettingsPage: MenuPage | null = null;
  const calls: MainMenuRigCalls = { push: [], pop: 0, forceClose: 0, startMultiplayerGame: [] };

  const menuAPI = {
    ...realMenuAPI,
    RegisterPage(name: string, page: MenuPage): void {
      if (name === 'main') {
        mainPage = page;
      } else if (name === 'hellwave_profile') {
        profilePage = page;
      } else if (name === 'hellwave_newgame') {
        newGamePage = page;
      } else if (name === 'hellwave_newgame_settings') {
        newGameSettingsPage = page;
      }
      realMenuAPI.RegisterPage(name, page);
    },
    Push(name: string): void {
      calls.push.push(name);
      realMenuAPI.Push(name);
    },
    Pop(): void {
      calls.pop += 1;
      realMenuAPI.Pop();
    },
    ForceClose(): void {
      calls.forceClose += 1;
      realMenuAPI.ForceClose();
    },
    StartMultiplayerGame(mapname: string): void {
      calls.startMultiplayerGame.push(mapname);
    },
  };

  const engine = createMockClientEngine({ ...engineOverrides, Menu: menuAPI });

  HellwaveMenu.Init(asClientEngineAPI(engine));

  /**
   * A page the menu registered.
   * @param page What the registration recorded.
   * @param name The page name, for the failure message.
   * @returns The page.
   */
  const registered = (page: MenuPage | null, name: string): MenuPage => {
    assert.ok(page, `page "${name}" is registered`);
    return page;
  };

  return {
    engine,
    calls,
    getMainPage: () => registered(mainPage, 'main'),
    getProfilePage: () => registered(profilePage, 'hellwave_profile'),
    getNewGamePage: () => registered(newGamePage, 'hellwave_newgame'),
    getNewGameSettingsPage: () => registered(newGameSettingsPage, 'hellwave_newgame_settings'),
  };
}
