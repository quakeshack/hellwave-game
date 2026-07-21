import { createMockClientEngine, createMockMenuAPI } from '../../../../id1/test/client/fixtures.ts';

/**
 * Create a rig for `HellwaveMenu`, capturing the registered `'main'`/`'hellwave_profile'`/
 * `'hellwave_newgame'`/`'hellwave_newgame_settings'` pages and tracking calls to the menu
 * actions the mock stub (`createMockMenuAPI()`) doesn't record on its own
 * (`Push`/`Pop`/`ForceClose`/`StartMultiplayerGame`).
 * @param {object} HellwaveMenu The `HellwaveMenu` orchestrator class -- passed in rather than
 * imported here so each test file controls its own dynamic-import ordering relative to the
 * `id1/GameAPI.ts` bootstrap (see the game-logic-port porting guide's note on ESM
 * circular-dependency ordering in tests).
 * @param {object} engineOverrides Additional overrides merged into the mock engine (besides `Menu`, which this rig owns) -- e.g. `{ Multiplayer: { ListSessions: async () => [...] } }`.
 * @returns {{ engine: object, calls: { push: string[], pop: number, forceClose: number, startMultiplayerGame: string[] }, getMainPage: () => object, getProfilePage: () => object, getNewGamePage: () => object, getNewGameSettingsPage: () => object }} Test rig.
 */
export function createMainMenuRig(HellwaveMenu, engineOverrides = {}) {
  const realMenuAPI = createMockMenuAPI();
  let mainPage = null;
  let profilePage = null;
  let newGamePage = null;
  let newGameSettingsPage = null;
  const calls = { push: [], pop: 0, forceClose: 0, startMultiplayerGame: [] };

  const menuAPI = {
    ...realMenuAPI,
    RegisterPage(name, page) {
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
    Push(name) {
      calls.push.push(name);
      realMenuAPI.Push(name);
    },
    Pop() {
      calls.pop += 1;
      realMenuAPI.Pop();
    },
    ForceClose() {
      calls.forceClose += 1;
      realMenuAPI.ForceClose();
    },
    StartMultiplayerGame(mapname) {
      calls.startMultiplayerGame.push(mapname);
    },
  };

  const engine = createMockClientEngine({ ...engineOverrides, Menu: menuAPI });

  HellwaveMenu.Init(engine);

  return {
    engine,
    calls,
    getMainPage: () => mainPage,
    getProfilePage: () => profilePage,
    getNewGamePage: () => newGamePage,
    getNewGameSettingsPage: () => newGameSettingsPage,
  };
}

/**
 * Temporarily replace the global `setInterval`/`clearInterval` with instrumented stand-ins that
 * record every call and let a test manually fire a captured callback instead of waiting for a
 * real interval -- used to test the main page's session-list polling deterministically. `callback`
 * may be async; it's awaited before the real timers are restored.
 * @param {(rig: { intervals: Array<{ fn: () => void, ms: number, cleared: boolean }>, tick: (handle: object) => void }) => unknown} callback Test callback, given `{ intervals, tick }`.
 * @returns {Promise<void>} Resolves once `callback` (and timer restoration) completes.
 */
export async function withMockTimers(callback) {
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const intervals = [];

  globalThis.setInterval = (fn, ms) => {
    const handle = { fn, ms, cleared: false };
    intervals.push(handle);
    return handle;
  };
  globalThis.clearInterval = (handle) => {
    if (handle) {
      handle.cleared = true;
    }
  };

  try {
    await callback({
      intervals,
      tick(handle) {
        if (!handle.cleared) {
          handle.fn();
        }
      },
    });
  } finally {
    // The awaited callback above has already fully settled by this point -- nothing else in
    // this synchronous process could have reassigned these globals in between.
    // eslint-disable-next-line require-atomic-updates
    globalThis.setInterval = originalSetInterval;
    // eslint-disable-next-line require-atomic-updates
    globalThis.clearInterval = originalClearInterval;
  }
}
