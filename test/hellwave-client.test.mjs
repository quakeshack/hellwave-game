import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { K } from '../../../shared/Keys.ts';
import Vector from '../../../shared/Vector.ts';
import { createMockClientEngine, createMockMenuAPI, createMockSound } from '../../id1/test/client/fixtures.ts';

await import('../../id1/GameAPI.ts');

const { clientEvent, clientEventName, formatMoney, items, toBuyImpulse } = await import('../Defs.ts');
const { phases } = await import('../Phases.ts');
const { buyMenuItems } = await import('../entity/Player.ts');
const clientApiModule = await import('../client/ClientAPI.ts');
const hudModule = await import('../client/HUD.ts');
const menuModule = await import('../client/Menu.ts');

const { ClientGameAPI } = clientApiModule;
const HellwaveHUD = hudModule.default;
const HellwaveMenu = menuModule.default;

/**
 * Build the expected buy-menu row label for a catalog entry, matching `HellwaveHUD`'s format.
 * @param {number} impulse Catalog key (1-9).
 * @returns {string} Expected row label.
 */
function expectedBuyRowLabel(impulse) {
  const item = buyMenuItems[impulse];

  return `[${impulse}] ${formatMoney(item.cost).padStart(5)} - ${item.label}`;
}

/**
 * Create a minimal Hellwave clientdata map for tests.
 * @param {object} overrides Override values.
 * @returns {object} Mock clientdata.
 */
function createClientdata(overrides = {}) {
  return {
    health: 100,
    armorvalue: 0,
    armortype: 0,
    items: 0,
    ammo_shells: 0,
    ammo_nails: 0,
    ammo_rockets: 0,
    ammo_cells: 0,
    weapon: 0,
    weaponframe: 0,
    effects: 0,
    money: 0,
    buyzone: 0,
    spectating: false,
    ...overrides,
  };
}

/**
 * Create a minimal Hellwave game object for HUD tests.
 * @param {object} engine Mock engine.
 * @param {object} overrides Override values.
 * @returns {object} Mock client game.
 */
function createHellwaveGame(engine, overrides = {}) {
  return {
    clientdata: createClientdata(),
    engine,
    serverInfo: {
      hostname: 'Hellwave Test Server',
      coop: '1',
    },
    sfx: {
      phase: {
        quiet: [createMockSound('phase/quiet.mp3')],
        normal: [createMockSound('phase/normal-1.mp3')],
      },
    },
    ...overrides,
  };
}

/**
 * Create a HUD wired to a real (mock) menu stack, capturing the buy-menu page it registers
 * so tests can drive its rows/customHandleInput/onEscape directly instead of only observing
 * through `engine.Menu.IsOpen()`.
 * @param {object} clientdataOverrides Overrides merged into the initial clientdata.
 * @param {object} engineOverrides Additional overrides merged into the mock engine (besides `Menu`, which this rig owns).
 * @returns {{ engine: object, hud: object, getBuyMenuPage: () => object }} Test rig.
 */
function createBuyMenuHud(clientdataOverrides = {}, engineOverrides = {}) {
  const realMenuAPI = createMockMenuAPI();
  let buyMenuPage = null;
  const menuAPI = {
    ...realMenuAPI,
    RegisterPage(name, page) {
      if (name === 'hellwave_buy') {
        buyMenuPage = page;
      }
      realMenuAPI.RegisterPage(name, page);
    },
  };

  const engine = createMockClientEngine({ ...engineOverrides, Menu: menuAPI });
  const game = createHellwaveGame(engine, {
    clientdata: createClientdata(clientdataOverrides),
  });
  const hud = new HellwaveHUD(game, engine);

  // `hw_buymenu` is registered once by the static lifecycle hook (see HUD.ts `Init`), not by
  // instance init -- needed here since the command handler reads the currently-active instance.
  HellwaveHUD.Init(engine);
  hud.init();

  return {
    engine,
    hud,
    getBuyMenuPage: () => buyMenuPage,
  };
}

/**
 * Create a rig for `HellwaveMenu`, capturing the registered `'main'`/`'hellwave_profile'`/
 * `'hellwave_newgame'`/`'hellwave_newgame_settings'` pages and tracking calls to the menu
 * actions the mock stub (`createMockMenuAPI()`) doesn't record on its own
 * (`Push`/`Pop`/`ForceClose`/`StartMultiplayerGame`), the same way `createBuyMenuHud` captures
 * `'hellwave_buy'`.
 * @param {object} engineOverrides Additional overrides merged into the mock engine (besides `Menu`, which this rig owns) -- e.g. `{ Multiplayer: { ListSessions: async () => [...] } }`.
 * @returns {{ engine: object, calls: { push: string[], pop: number, forceClose: number, startMultiplayerGame: string[] }, getMainPage: () => object, getProfilePage: () => object, getNewGamePage: () => object, getNewGameSettingsPage: () => object }} Test rig.
 */
function createMainMenuRig(engineOverrides = {}) {
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
async function withMockTimers(callback) {
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

void describe('Hellwave HUD', () => {
  void test('reuses the inherited stats getter for Hellwave-specific stats', () => {
    const engine = createMockClientEngine();
    const game = createHellwaveGame(engine);
    const hud = new HellwaveHUD(game, engine);

    hud.init();

    engine.eventBus.publish(clientEventName(clientEvent.STATS_UPDATED), 'round_total', 6);
    engine.eventBus.publish(clientEventName(clientEvent.STATS_UPDATED), 'phase', phases.quiet);

    assert.equal(hud.stats.round_total, 6);
    assert.equal(hud.stats.phase, phases.quiet);
  });

  void test('plays phase sounds, updates money, and shows the spectator status message', () => {
    const originalRandom = Math.random;
    const engine = createMockClientEngine();
    Math.random = () => 0.0;

    try {
      HellwaveHUD.Init(engine);
      const game = createHellwaveGame(engine, {
        clientdata: createClientdata({ spectating: true }),
      });
      const hud = new HellwaveHUD(game, engine);

      hud.init();

      engine.eventBus.publish(clientEventName(clientEvent.STATS_UPDATED), 'phase', phases.normal);
      engine.eventBus.publish(clientEventName(clientEvent.MONEY_UPDATE), 250);

      hud.draw();

      assert.equal(game.sfx.phase.normal[0].playCount, 1);
      assert.deepEqual(hud.inventory.money, [250, null, 0]);
      assert.deepEqual(engine.contentShifts.length, 1);
      assert.ok(engine.drawStrings.some(({ text }) => text === 'Spectating... Waiting for next round'));
    } finally {
      HellwaveHUD.Shutdown(engine);
      Math.random = originalRandom;
    }
  });

  void test('reacts to a money clientdata field-change event', () => {
    const engine = createMockClientEngine();
    const game = createHellwaveGame(engine, {
      clientdata: createClientdata({ buyzone: 0, money: 0 }),
    });
    const hud = new HellwaveHUD(game, engine);

    hud.init();

    engine.eventBus.publish('client.clientdata.field-changed', 'money', 400, 250);

    assert.deepEqual(hud.inventory.money, [400, null, 0]);
  });

  void describe('hw_buymenu command registration', () => {
    void test('is not registered by per-instance init -- only by the static Init lifecycle hook', () => {
      const engine = createMockClientEngine();
      const game = createHellwaveGame(engine);

      // Simulates two map loads sharing one client engine, since a fresh `HellwaveHUD` is
      // constructed on every map load (see `ClientGameAPI`). Before this fix, `hw_buymenu` was
      // registered from instance init, so the second `hud.init()` here would hit
      // `Cmd.AddCommand`'s "already exists" assert.
      new HellwaveHUD(game, engine).init();
      new HellwaveHUD(game, engine).init();

      assert.equal(engine.commands.has('hw_buymenu'), false);
    });

    void test('static Init registers it once; Shutdown unregisters it', () => {
      const engine = createMockClientEngine();

      HellwaveHUD.Init(engine);
      assert.equal(engine.commands.has('hw_buymenu'), true);

      HellwaveHUD.Shutdown(engine);
      assert.equal(engine.commands.has('hw_buymenu'), false);
    });

    void test('the hw_buymenu handler is a no-op once its HUD instance has been shut down', () => {
      const engine = createMockClientEngine();
      const game = createHellwaveGame(engine, {
        clientdata: createClientdata({ buyzone: 1 }),
      });

      HellwaveHUD.Init(engine);
      const hud = new HellwaveHUD(game, engine);
      hud.init();
      hud.shutdown();

      void engine.commands.get('hw_buymenu')();

      assert.equal(engine.Menu.IsOpen('hellwave_buy'), false);

      HellwaveHUD.Shutdown(engine);
    });
  });

  void test('+showscores/-showscores (inherited from Q1HUD) still toggle the scoreboard on a HellwaveHUD instance', () => {
    const engine = createMockClientEngine();

    // Regression test: the `+showscores`/`-showscores` commands registered by `Q1HUD.Init`
    // publish a `hud.showscores` event on the shared event bus rather than writing to a static
    // class field, so any live HUD instance -- including a `HellwaveHUD` -- picks up the toggle
    // through its own `hud.showscores` subscription.
    HellwaveHUD.Init(engine);

    try {
      const game = createHellwaveGame(engine);
      const hud = new HellwaveHUD(game, engine);

      hud.init();

      engine.drawPics.length = 0;
      hud.draw();
      assert.equal(engine.drawPics.some(({ pic }) => pic.name === 'SCOREBAR'), false);

      void engine.commands.get('+showscores')();
      engine.drawPics.length = 0;
      hud.draw();
      assert.equal(engine.drawPics.some(({ pic }) => pic.name === 'SCOREBAR'), true);

      void engine.commands.get('-showscores')();
      engine.drawPics.length = 0;
      hud.draw();
      assert.equal(engine.drawPics.some(({ pic }) => pic.name === 'SCOREBAR'), false);
    } finally {
      HellwaveHUD.Shutdown(engine);
    }
  });

  void describe('buy menu as a real menu page', () => {
    /**
     * Simulate pressing `b` -- triggers the `hw_buymenu` client command the HUD registers,
     * exactly like the real keybind does, with no server round-trip involved.
     * @param {object} engine Mock client engine returned by `createBuyMenuHud`.
     */
    function pressBuyMenuKey(engine) {
      engine.commands.get('hw_buymenu')();
    }

    /**
     * Simulate a synced clientdata field changing: mutates `game.clientdata[field]` before
     * publishing the change event, matching what `ClientMessages.parseClientData` actually does
     * in production (update-then-publish) -- code reading `game.clientdata` directly, like the
     * `hw_buymenu` command, depends on the field already being current by the time it runs.
     * @param {object} hud HUD instance returned by `createBuyMenuHud`.
     * @param {object} engine Mock client engine returned by `createBuyMenuHud`.
     * @param {string} field Clientdata field name.
     * @param {number} value New value.
     */
    function publishClientdataChange(hud, engine, field, value) {
      const previousValue = hud.game.clientdata[field];
      hud.game.clientdata[field] = value;
      engine.eventBus.publish('client.clientdata.field-changed', field, value, previousValue);
    }

    void test('opens instantly (no server round-trip) once the server confirms the player is in a buyzone', () => {
      const { engine, hud } = createBuyMenuHud({ buyzone: 0, money: 0 });

      pressBuyMenuKey(engine);
      assert.equal(engine.Menu.IsOpen('hellwave_buy'), false); // buyzone still 0, refused

      publishClientdataChange(hud, engine, 'buyzone', 1);
      assert.equal(engine.Menu.IsOpen('hellwave_buy'), false); // in the zone, but menu not requested yet

      pressBuyMenuKey(engine);
      assert.equal(engine.Menu.IsOpen('hellwave_buy'), true);
      assert.deepEqual(engine.appendedConsoleText, []); // purely local -- nothing sent to the server
    });

    void test('applies the buy-menu blur/desaturate post-process while open, clears it on close', () => {
      const postProcessSetStacks = [];
      const { engine } = createBuyMenuHud({ buyzone: 1, money: 0 }, {
        PostProcess: {
          setStack(stack) { postProcessSetStacks.push(stack); },
          clearStack() { postProcessSetStacks.push(null); },
          hasStack() { return postProcessSetStacks.at(-1) !== null; },
        },
      });

      pressBuyMenuKey(engine);
      assert.equal(postProcessSetStacks.length, 1);
      assert.notEqual(postProcessSetStacks[0], null);

      engine.Menu.Pop();
      assert.equal(postProcessSetStacks.length, 2);
      assert.equal(postProcessSetStacks[1], null);
    });

    void test('closes involuntarily when the server says we left the zone, without waiting for Escape/b', () => {
      const { engine } = createBuyMenuHud({ buyzone: 1, money: 0 });

      pressBuyMenuKey(engine);
      assert.equal(engine.Menu.IsOpen('hellwave_buy'), true);

      // Round timer ran out / player forced out of the zone -- not an explicit Escape/b press.
      engine.eventBus.publish('client.clientdata.field-changed', 'buyzone', -1, 1);
      assert.equal(engine.Menu.IsOpen('hellwave_buy'), false);
    });

    void test('refreshes row labels, the balance label, and hides items the player cannot afford, on open and on money changes', () => {
      const { engine, getBuyMenuPage } = createBuyMenuHud({ buyzone: 1, money: 0 });

      engine.eventBus.publish('client.clientdata.field-changed', 'money', 150, 0);
      pressBuyMenuKey(engine);

      const page = getBuyMenuPage();
      const [, moneyLabel, , heavyArmorRow, shotgunRow] = page.items;

      assert.equal(moneyLabel.label, `Balance: ${formatMoney(150)}`);
      assert.equal(heavyArmorRow.visible, true); // costs 100
      assert.equal(heavyArmorRow.label, expectedBuyRowLabel(1));
      assert.equal(shotgunRow.visible, false); // costs 200, can't afford yet

      engine.eventBus.publish('client.clientdata.field-changed', 'money', 250, 150);

      assert.equal(moneyLabel.label, `Balance: ${formatMoney(250)}`);
      assert.equal(shotgunRow.visible, true);
      assert.equal(shotgunRow.label, expectedBuyRowLabel(2));
    });

    void test('activating a row sends its dedicated buy-impulse, never a plain weapon-select impulse', () => {
      const { engine, getBuyMenuPage } = createBuyMenuHud({ buyzone: 1, money: 1000 });

      engine.eventBus.publish('client.clientdata.field-changed', 'money', 1000, 0);
      pressBuyMenuKey(engine);

      const heavyArmorRow = getBuyMenuPage().items[3];
      heavyArmorRow.action();

      assert.deepEqual(engine.appendedConsoleText, [`impulse ${toBuyImpulse(1)}\n`]);
    });

    void test('hovering the mouse over a row moves the focus cursor to it, like every other menu', () => {
      const { engine, getBuyMenuPage } = createBuyMenuHud({ buyzone: 1, money: 1000 });

      engine.eventBus.publish('client.clientdata.field-changed', 'money', 1000, 0);
      pressBuyMenuKey(engine);

      const page = getBuyMenuPage();

      // The built-in blinking cursor is disabled here on purpose (see the next test) -- hover
      // still tracks `page.cursor` the normal way regardless, since that's `VerticalLayout.hitTest`,
      // unrelated to whether it also draws its own cursor glyph.
      assert.equal(page.layout.showCursor, false);

      // Row y-positions: header (y=40) + money label (y=52) -- the feedback label is invisible
      // by default and consumes no space -- then item 1 (y=64) and item 2 (y=76), each 8 tall.
      page.updateHover(100, 66);
      assert.equal(page.cursor, 3); // item 1 (Heavy Armor)

      page.updateHover(100, 78);
      assert.equal(page.cursor, 4); // item 2 (Shotgun / 20 shells)
    });

    void test('shows purchase feedback and lets it expire after a few seconds', () => {
      const { engine, hud, getBuyMenuPage } = createBuyMenuHud({ buyzone: 1, money: 0 });

      pressBuyMenuKey(engine);

      const feedbackLabel = getBuyMenuPage().items[2];

      assert.equal(feedbackLabel.visible, false);

      engine.eventBus.publish(clientEventName(clientEvent.BUY_MESSAGE), 'bought Heavy Armor!');

      assert.equal(feedbackLabel.visible, true);
      assert.equal(feedbackLabel.label, 'bought Heavy Armor!');

      hud.draw(); // still within the expiry window
      assert.equal(feedbackLabel.visible, true);

      engine.CL.gametime += 10;
      hud.draw();
      assert.equal(feedbackLabel.visible, false);
    });

    void test('customHandleInput routes 1-9 to their dedicated buy-impulse and falls back to default navigation otherwise', () => {
      const { engine, getBuyMenuPage } = createBuyMenuHud({ buyzone: 1, money: 0 });

      pressBuyMenuKey(engine);

      const page = getBuyMenuPage();

      assert.equal(page.handleInput('9'.charCodeAt(0)), true);
      assert.deepEqual(engine.appendedConsoleText, [`impulse ${toBuyImpulse(9)}\n`]);

      // Not a digit -- falls through to the default MenuPage handling instead of being
      // swallowed (which returns false here since nothing binds F1).
      assert.equal(page.handleInput(K.F1), false);
      assert.deepEqual(engine.appendedConsoleText, [`impulse ${toBuyImpulse(9)}\n`]);
    });

    void test('Escape closes immediately and purely locally -- nothing is sent to the server', () => {
      const { engine, getBuyMenuPage } = createBuyMenuHud({ buyzone: 1, money: 0 });

      pressBuyMenuKey(engine);
      assert.equal(engine.Menu.IsOpen('hellwave_buy'), true);

      getBuyMenuPage().handleInput(K.ESCAPE);

      assert.deepEqual(engine.appendedConsoleText, []);
      assert.equal(engine.Menu.IsOpen('hellwave_buy'), false);
    });
  });
});

void describe('Hellwave client API', () => {
  void test('suppresses the viewmodel while spectating and renders navigation hints as rocket trails', () => {
    const engine = createMockClientEngine();
    const clientGame = new ClientGameAPI(engine);

    clientGame.init();
    clientGame.clientdata = createClientdata({
      spectating: true,
      weapon: items.IT_SHOTGUN,
      weaponframe: 2,
    });

    engine.eventBus.publish(
      clientEventName(clientEvent.NAV_HINT),
      new Vector(0, 0, 0),
      new Vector(32, 0, 0),
      new Vector(64, 32, 0),
      new Vector(96, 32, 0),
    );
    clientGame.startFrame();

    assert.equal(clientGame.viewmodel.visible, false);
    assert.equal(clientGame.viewmodel.model, null);
    assert.equal(engine.rocketTrails.length, 7);
    assert.ok(engine.rocketTrails.every((trail) => trail.type === 7));
    assert.deepEqual(engine.sounds.map((sound) => sound.name), [
      'phase/quiet.mp3',
      'phase/normal-1.mp3',
      'phase/normal-2.mp3',
    ]);
  });

  void test('loads and frees the loading screen while applying bloom defaults', async () => {
    const engine = createMockClientEngine();

    ClientGameAPI.Init(engine);
    await Promise.resolve();

    assert.equal(ClientGameAPI.loadingScreen?.name, 'gfx/loadingscreen.png');
    assert.equal(ClientGameAPI.loadingScreen?.lockedTextureMode, 'GL_LINEAR');
    assert.deepEqual(engine.cvarSets, [
      ['r_bloom', true],
      ['r_bloom_downsample', 8],
      ['r_bloom_dlight_strength', 0.33],
      ['r_bloom_sky_strength', 0.33],
      ['r_bloom_specular_strength', 0.33],
      ['r_bloom_strength', 1],
    ]);

    const loadingScreen = ClientGameAPI.loadingScreen;
    ClientGameAPI.Shutdown(engine);

    assert.equal(loadingScreen?.freed, true);
    assert.equal(ClientGameAPI.loadingScreen, null);
  });

  void test('gives a fresh player a randomized name instead of the shared "player" default', () => {
    const engine = createMockClientEngine({}, { cvars: { _cl_name: 'player' } });
    const originalRandom = Math.random;
    Math.random = () => 0;

    try {
      ClientGameAPI.Init(engine);
    } finally {
      Math.random = originalRandom;
    }

    assert.notEqual(engine.GetCvar('_cl_name').string, 'player');
    assert.match(engine.GetCvar('_cl_name').string, /^[A-Z][a-z]+[A-Z][a-z]+\d+$/);
  });

  void test('leaves an existing custom name untouched', () => {
    const engine = createMockClientEngine({}, { cvars: { _cl_name: 'ReturningPlayer' } });

    ClientGameAPI.Init(engine);

    assert.equal(engine.GetCvar('_cl_name').string, 'ReturningPlayer');
  });

  void test('registers the hellwave main menu page alongside the inherited id1 pages', () => {
    const engine = createMockClientEngine();

    ClientGameAPI.Init(engine);

    engine.Menu.Push('main');
    assert.equal(engine.Menu.IsOpen('main'), true);

    // 'main' starts a session-list poll interval on activate (onEnter) -- pop it so that
    // interval is cleared (onExit) instead of leaking past this test.
    engine.Menu.Pop();
  });

  void test('reaches HellwaveHUD.Init through the game-module Init chain, not just the inherited Q1HUD.Init', async () => {
    const engine = createMockClientEngine();

    // Regression test: `ClientGameAPI.Init` (id1) used to call `Q1HUD.Init` directly, so a
    // subclass's own static Init (registering `hw_buymenu`) never ran in production even though
    // it worked fine when tests invoked `HellwaveHUD.Init` directly.
    ClientGameAPI.Init(engine);
    await Promise.resolve(); // flush the loading-screen load Init kicks off

    assert.equal(engine.commands.has('hw_buymenu'), true);

    ClientGameAPI.Shutdown(engine);
    assert.equal(engine.commands.has('hw_buymenu'), false);
  });
});

void describe('Hellwave main menu', () => {
  // `Action.handleInput(K.ENTER)`/`MenuPage._moveCursor` (arrow keys) play a nav/confirm sound
  // through the real `S`/`M` registry singletons, which this lightweight mock doesn't set up --
  // same constraint the buy-menu tests above already work around. Row actions are invoked
  // directly (`page.items[i].action()`) instead of through `page.handleInput(K.ENTER)`, and
  // focus/hit-testing is exercised through `updateHover()`/`layout.hitTest()` directly instead of
  // arrow-key `handleInput()` calls -- neither of those touches sound.

  void test('registers \'main\' with New Game, Profile, Options, and Quit, all enabled', () => {
    const { getMainPage } = createMainMenuRig();
    const page = getMainPage();

    assert.deepEqual(page.items.map((item) => item.label), ['New Game', 'Profile', 'Options', 'Quit']);
    assert.deepEqual(page.items.map((item) => item.enabled), [true, true, true, true]);
  });

  void test('attaches the header bitmap font to every sidebar item once it finishes loading', async () => {
    const { getMainPage } = createMainMenuRig();
    const page = getMainPage();

    assert.deepEqual(page.items.map((item) => item.font), [null, null, null, null]);

    await Promise.resolve(); // flush LoadBitmapFont's promise

    for (const item of page.items) {
      assert.equal(item.font.charset, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    }
  });

  void test('New Game opens the profile gate first when no profile has been confirmed yet', () => {
    const { calls, getMainPage, getProfilePage } = createMainMenuRig();

    getMainPage().items[0].action();

    assert.deepEqual(calls.push, ['hellwave_profile']);
    assert.equal(calls.forceClose, 0);
    assert.equal(getProfilePage().items.at(-1).label, 'Continue'); // gate-specific CTA label
  });

  void test('New Game opens the map picker immediately once a profile has already been confirmed', () => {
    const { engine, calls, getMainPage } = createMainMenuRig();
    engine.SetCvar('hw_profile_confirmed', '1');

    getMainPage().items[0].action();

    assert.deepEqual(calls.push, ['hellwave_newgame']);
    assert.deepEqual(engine.appendedConsoleText, []);
    assert.equal(calls.forceClose, 0);
  });

  void test('accepting the profile gate confirms the profile and then opens the map picker', () => {
    const { engine, calls, getMainPage, getProfilePage } = createMainMenuRig();

    getMainPage().items[0].action(); // opens the gate, Continue label
    getProfilePage().items.at(-1).action(); // accept

    assert.equal(engine.GetCvar('hw_profile_confirmed').string, '1');
    assert.deepEqual(calls.push, ['hellwave_profile', 'hellwave_newgame']);
  });

  void test('Options and Quit push the inherited id1 pages', () => {
    const { calls, getMainPage } = createMainMenuRig();
    const page = getMainPage();

    page.items[2].action();
    page.items[3].action();

    assert.deepEqual(calls.push, ['options', 'quit']);
  });

  void test('hovering the mouse moves focus to the row under the pointer', () => {
    const { getMainPage } = createMainMenuRig();
    const page = getMainPage();

    // Row y-positions: New Game (y=56), Profile (y=80), Options (y=104), Quit (y=128), each 24 tall.
    // This is what actually fixes the "hover doesn't move the cursor on the main menu" bug -- the
    // previous implementation had no real `layout`/`items` for `updateHover()` to resolve against.
    page.updateHover(30, 110);
    assert.equal(page.cursor, 2); // Options

    page.updateHover(30, 80);
    assert.equal(page.cursor, 1); // Profile

    page.updateHover(30, 128);
    assert.equal(page.cursor, 3); // Quit
  });

  void test('layout.hitTest resolves sidebar rows within their own column and ignores the empty session column', () => {
    const { getMainPage } = createMainMenuRig();
    const page = getMainPage();

    assert.equal(page.layout.hitTest(page.items, 30, 56), 0); // New Game
    assert.equal(page.layout.hitTest(page.items, 30, 128), 3); // Quit
    assert.equal(page.layout.hitTest(page.items, 200, 56), null); // session column, nothing there yet
    assert.equal(page.layout.hitTest(page.items, 30, 500), null); // below every row
  });

  void test('Escape closes the menu', () => {
    const { engine, getMainPage } = createMainMenuRig();
    const page = getMainPage();

    engine.Menu.Push('main');
    assert.equal(engine.Menu.IsOpen('main'), true);

    page.handleInput(K.ESCAPE);

    assert.equal(engine.Menu.IsOpen(), false);
  });
});

void describe('Hellwave profile page', () => {
  void test('onEnter loads the current name into the field', () => {
    const { engine, getMainPage, getProfilePage } = createMainMenuRig();
    engine.SetCvar('_cl_name', 'Grunt99');

    getMainPage().items[1].action(); // Profile, standalone

    assert.equal(getProfilePage().items[0].value, 'Grunt99');
  });

  void test('opening standalone from the sidebar uses the default label and just pops back on accept', () => {
    const { calls, getMainPage, getProfilePage } = createMainMenuRig();

    getMainPage().items[1].action();
    const page = getProfilePage();

    assert.equal(page.items.at(-1).label, 'Accept Changes');

    page.items.at(-1).action();

    assert.equal(calls.pop, 1);
    assert.deepEqual(calls.push, ['hellwave_profile']); // no map picker opened, this wasn't a gate
  });

  void test('accepting with an unchanged name sends no console text, but still confirms the profile', () => {
    const { engine, getMainPage, getProfilePage } = createMainMenuRig();
    engine.SetCvar('_cl_name', 'Grunt99');

    getMainPage().items[1].action();
    getProfilePage().items.at(-1).action();

    assert.deepEqual(engine.appendedConsoleText, []);
    assert.equal(engine.GetCvar('hw_profile_confirmed').string, '1');
  });

  void test('accepting a changed name sends the name command', () => {
    const { engine, getMainPage, getProfilePage } = createMainMenuRig();
    engine.SetCvar('_cl_name', 'Grunt99');

    getMainPage().items[1].action();
    const page = getProfilePage();
    page.items[0].value = 'NewName';
    page.items.at(-1).action();

    assert.deepEqual(engine.appendedConsoleText, ['name "NewName"\n']);
  });

  void test('accepting a changed color sends the color command', () => {
    const { engine, getMainPage, getProfilePage } = createMainMenuRig();
    engine.SetCvar('_cl_color', '0');

    getMainPage().items[1].action();
    const page = getProfilePage();
    page.items[1].setValue(3); // vest
    page.items[2].setValue(7); // pants
    page.items.at(-1).action();

    assert.deepEqual(engine.appendedConsoleText, ['color 3 7\n']);
  });

  void test('Escape pops back without confirming the profile or sending anything', () => {
    const { engine, calls, getMainPage, getProfilePage } = createMainMenuRig();
    engine.SetCvar('_cl_name', 'Grunt99');

    getMainPage().items[1].action();
    getProfilePage().items[0].value = 'NewName';
    getProfilePage().handleInput(K.ESCAPE);

    assert.equal(calls.pop, 1);
    assert.deepEqual(engine.appendedConsoleText, []);
    assert.equal(engine.GetCvar('hw_profile_confirmed').string, '0');
  });
});

void describe('Hellwave new game map picker', () => {
  void test('registers \'hellwave_newgame\' with one card per curated map', () => {
    const { getNewGamePage } = createMainMenuRig();
    const page = getNewGamePage();

    assert.equal(page.title, 'Select a Map');
    assert.deepEqual(page.items.map((item) => item.label), ['Doomed computer station', 'Castle of the damned']);
  });

  void test('layout.hitTest resolves each card and ignores the gap between them', () => {
    const { getNewGamePage } = createMainMenuRig();
    const page = getNewGamePage();

    // Cards: hw_doom at x=[30,150), hw_e1m2 at x=[170,290), both y starting at 40.
    assert.equal(page.layout.hitTest(page.items, 75, 90), 0);
    assert.equal(page.layout.hitTest(page.items, 200, 90), 1);
    assert.equal(page.layout.hitTest(page.items, 160, 90), null); // the gap
    assert.equal(page.layout.hitTest(page.items, 75, 500), null); // below every card
  });

  void test('draws a light-blue hover border around only the focused card', () => {
    const { engine, getNewGamePage } = createMainMenuRig();
    const page = getNewGamePage();
    const hoverColor = new Vector(171 / 255, 231 / 255, 255 / 255);

    engine.drawRects.length = 0;
    page.layout.draw(page.items, 0);

    assert.equal(engine.drawRects.length, 4); // one hollow border: top/bottom/left/right
    for (const rect of engine.drawRects) {
      assert.deepEqual(rect.color, hoverColor);
    }

    engine.drawRects.length = 0;
    page.layout.draw(page.items, 1); // second card focused instead

    assert.equal(engine.drawRects.length, 4); // still exactly one border, now around the other card
  });

  void test('long map labels wrap onto a second line instead of overflowing into the next card', () => {
    // Regression test: a real playtest found "Doomed computer station"/"Castle of the damned"
    // (both longer than one card is wide, 15 chars/line at CARD_WIDTH=120) rendering as a single
    // line and running together across the gap into the neighboring card's label. Both curated
    // labels need wrapping -- assert the hit region grows to cover the wrapped second label line
    // (y=178, between the old single-line bottom at 174 and the correct two-line bottom at 182)
    // instead of stopping short after only the first line's height.
    const { getNewGamePage } = createMainMenuRig();
    const page = getNewGamePage();

    for (const item of page.items) {
      assert.ok(item.label.length > 15, `expected "${item.label}" to actually need wrapping for this test to mean anything`);
    }

    assert.equal(page.layout.hitTest(page.items, 75, 178), 0);
    assert.equal(page.layout.hitTest(page.items, 200, 178), 1);
  });

  void test('picking a map opens the per-map settings screen instead of starting it directly', () => {
    const { calls, getNewGamePage, getNewGameSettingsPage } = createMainMenuRig();

    getNewGamePage().items[0].action(); // hw_doom

    assert.deepEqual(calls.push, ['hellwave_newgame_settings']);
    assert.equal(calls.forceClose, 0);
    assert.deepEqual(calls.startMultiplayerGame, []);
    assert.ok(getNewGameSettingsPage());
  });

  void test('Escape pops back to the previous page', () => {
    const { calls, getNewGamePage } = createMainMenuRig();

    getNewGamePage().handleInput(K.ESCAPE);

    assert.equal(calls.pop, 1);
  });
});

void describe('Hellwave new game settings', () => {
  void test('onEnter loads the current rounds and private-game state from cvars', () => {
    const { engine, getNewGamePage, getNewGameSettingsPage } = createMainMenuRig();
    engine.SetCvar('hw_rounds', '6');
    engine.SetCvar('sv_public', '0'); // 0 = private

    getNewGamePage().items[0].action(); // hw_doom -- opens the settings screen
    const page = getNewGameSettingsPage();

    assert.equal(page.items[0].getValue(), 6);
    assert.equal(page.items[1].getValue(), 1); // private toggle is "on"
  });

  void test('defaults to 10 rounds and public when the cvars have never been set', () => {
    // The real engine's GetCvar() returns null for a cvar that was never registered (Cvar.FindVar
    // semantics); the mock auto-vivifies instead, so this override restores the real contract for
    // this one test.
    const { getNewGamePage, getNewGameSettingsPage } = createMainMenuRig({ GetCvar: () => null });

    getNewGamePage().items[0].action();
    const page = getNewGameSettingsPage();

    assert.equal(page.items[0].getValue(), 10);
    assert.equal(page.items[1].getValue(), 0); // public by default
  });

  void test('Start always hosts a multiplayer game on the selected map, never a bare singleplayer map', () => {
    const { engine, calls, getNewGamePage, getNewGameSettingsPage } = createMainMenuRig();

    getNewGamePage().items[1].action(); // hw_e1m2
    getNewGameSettingsPage().items.at(-1).action(); // Start, no changes made

    assert.deepEqual(calls.startMultiplayerGame, ['hw_e1m2']);
    assert.equal(calls.forceClose, 1);
    assert.deepEqual(engine.appendedConsoleText, []); // disconnect only sent when a server is active
  });

  void test('Start disconnects first when a server is already active', () => {
    const { engine, getNewGamePage, getNewGameSettingsPage } = createMainMenuRig();
    engine.SV.active = true;

    getNewGamePage().items[0].action();
    getNewGameSettingsPage().items.at(-1).action();

    assert.deepEqual(engine.appendedConsoleText, ['disconnect\n']);
  });

  void test('Start commits rounds/private-game only when actually changed from what was loaded', () => {
    const { engine, getNewGamePage, getNewGameSettingsPage } = createMainMenuRig();
    engine.SetCvar('hw_rounds', '10');
    engine.SetCvar('sv_public', '1');
    engine.cvarSets.length = 0; // discard the setup writes above

    getNewGamePage().items[0].action();
    const page = getNewGameSettingsPage();
    page.items[0].setValue(5); // Rounds: 5
    page.items[1].setValue(1); // private
    page.items.at(-1).action(); // Start

    assert.deepEqual(engine.cvarSets, [
      ['hw_rounds', '5'],
      ['sv_public', '0'],
    ]);
  });

  void test('Start does not touch cvars that were left unchanged', () => {
    const { engine, getNewGamePage, getNewGameSettingsPage } = createMainMenuRig();
    engine.SetCvar('hw_rounds', '10');
    engine.SetCvar('sv_public', '1');
    engine.cvarSets.length = 0; // discard the setup writes above

    getNewGamePage().items[0].action();
    getNewGameSettingsPage().items.at(-1).action(); // Start, no changes made

    assert.deepEqual(engine.cvarSets, []);
  });

  void test('Escape pops back to the map picker', () => {
    const { calls, getNewGamePage, getNewGameSettingsPage } = createMainMenuRig();

    getNewGamePage().items[0].action();
    getNewGameSettingsPage().handleInput(K.ESCAPE);

    assert.equal(calls.pop, 1);
  });

  void test('attaches the header bitmap font to the Start button once it finishes loading', async () => {
    const { getNewGamePage, getNewGameSettingsPage } = createMainMenuRig();

    getNewGamePage().items[0].action();
    const page = getNewGameSettingsPage();

    assert.equal(page.items.at(-1).font, null);

    await Promise.resolve(); // flush LoadBitmapFont's promise

    assert.equal(page.items.at(-1).font.charset, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  });

  void test('layout.hitTest resolves the Rounds/Private Game fields and the right-aligned Start button', async () => {
    const { getNewGamePage, getNewGameSettingsPage } = createMainMenuRig();

    getNewGamePage().items[0].action();
    const page = getNewGameSettingsPage();

    await Promise.resolve(); // flush LoadBitmapFont's promise, so Start is measured with the real font

    assert.equal(page.layout.hitTest(page.items, 200, 100), 0); // Rounds field row (startY=100)
    assert.equal(page.layout.hitTest(page.items, 200, 116), 1); // Private Game field row
    assert.equal(page.layout.hitTest(page.items, 280, 230), 2); // Start, bottom-right corner (right edge x=304, y=224)
    assert.equal(page.layout.hitTest(page.items, 200, 230), null); // left of Start's column
    assert.equal(page.layout.hitTest(page.items, 280, 160), null); // above Start's row
  });
});

void describe('Hellwave live session list', () => {
  void test('onEnter fetches sessions immediately and shows one row per session', async () => {
    const { engine, getMainPage } = createMainMenuRig({
      Multiplayer: {
        ListSessions: () => Promise.resolve([
          { sessionId: 'abc', map: 'hw_doom', currentPlayers: 2, maxPlayers: 4 },
          { sessionId: 'def', map: 'hw_e1m2', currentPlayers: 1, maxPlayers: 4 },
        ]),
      },
    });

    engine.Menu.Push('main');
    await Promise.resolve();
    await Promise.resolve();

    assert.deepEqual(getMainPage().items.slice(4).map((item) => item.label), [
      'hw_doom [2/4]',
      'hw_e1m2 [1/4]',
    ]);

    engine.Menu.Pop();
  });

  void test('shows "No sessions found." when the list is empty', async () => {
    const { engine, getMainPage } = createMainMenuRig(); // default mock resolves []

    engine.Menu.Push('main');
    await Promise.resolve();
    await Promise.resolve();

    assert.deepEqual(getMainPage().items.slice(4).map((item) => item.label), ['No sessions found.']);

    engine.Menu.Pop();
  });

  void test('shows "Unable to fetch sessions" when the fetch rejects', async () => {
    const { engine, getMainPage } = createMainMenuRig({
      Multiplayer: { ListSessions: () => Promise.reject(new Error('network down')) },
    });

    engine.Menu.Push('main');
    await Promise.resolve();
    await Promise.resolve();

    assert.deepEqual(getMainPage().items.slice(4).map((item) => item.label), ['Unable to fetch sessions']);

    engine.Menu.Pop();
  });

  void test('joining a session connects and closes the menu once a profile is confirmed', async () => {
    const { engine, getMainPage } = createMainMenuRig({
      Multiplayer: { ListSessions: () => Promise.resolve([{ sessionId: 'abc', map: 'hw_doom', currentPlayers: 1, maxPlayers: 4 }]) },
    });
    engine.SetCvar('hw_profile_confirmed', '1');

    engine.Menu.Push('main');
    await Promise.resolve();
    await Promise.resolve();

    getMainPage().items[4].action();

    assert.deepEqual(engine.appendedConsoleText, ['connect webrtc://abc\n']);
    assert.equal(engine.Menu.IsOpen(), false); // Menu.Close(), same as id1's launch_server join
  });

  void test('joining a session opens the profile gate first when unconfirmed, and accepting connects', async () => {
    const { engine, calls, getMainPage, getProfilePage } = createMainMenuRig({
      Multiplayer: { ListSessions: () => Promise.resolve([{ sessionId: 'abc', map: 'hw_doom', currentPlayers: 1, maxPlayers: 4 }]) },
    });

    engine.Menu.Push('main');
    await Promise.resolve();
    await Promise.resolve();

    getMainPage().items[4].action(); // Join -- no profile confirmed yet

    assert.deepEqual(calls.push, ['main', 'hellwave_profile']);
    assert.equal(getProfilePage().items.at(-1).label, 'Continue');
    assert.deepEqual(engine.appendedConsoleText, []); // not connected yet

    getProfilePage().items.at(-1).action(); // accept

    assert.deepEqual(engine.appendedConsoleText, ['connect webrtc://abc\n']);
    assert.equal(engine.GetCvar('hw_profile_confirmed').string, '1');
    assert.equal(engine.Menu.IsOpen(), false);
  });

  void test('polls for fresh sessions on an interval while showing, and stops once the page exits', async () => {
    let callCount = 0;
    const { engine, getMainPage } = createMainMenuRig({
      Multiplayer: {
        ListSessions: () => {
          callCount++;
          return Promise.resolve(callCount === 1
            ? [{ sessionId: 'first', map: 'hw_doom', currentPlayers: 1, maxPlayers: 4 }]
            : [{ sessionId: 'second', map: 'hw_e1m2', currentPlayers: 2, maxPlayers: 4 }]);
        },
      },
    });

    await withMockTimers(async ({ intervals, tick }) => {
      engine.Menu.Push('main');
      await Promise.resolve();
      await Promise.resolve();

      assert.equal(callCount, 1);
      assert.equal(intervals.length, 1);
      assert.deepEqual(getMainPage().items.slice(4).map((item) => item.label), ['hw_doom [1/4]']);

      tick(intervals[0]);
      await Promise.resolve();
      await Promise.resolve();

      assert.equal(callCount, 2);
      assert.deepEqual(getMainPage().items.slice(4).map((item) => item.label), ['hw_e1m2 [2/4]']);

      engine.Menu.Pop(); // onExit -- must clear the interval

      assert.equal(intervals[0].cleared, true);

      tick(intervals[0]); // tick() itself checks .cleared and no-ops
      await Promise.resolve();

      assert.equal(callCount, 2); // unchanged
    });
  });

  void test('skips a poll tick while the previous fetch is still in flight, instead of racing it', async () => {
    let resolveFirstFetch;
    let fetchCallCount = 0;
    const { engine } = createMainMenuRig({
      Multiplayer: {
        ListSessions: () => {
          fetchCallCount++;
          if (fetchCallCount === 1) {
            return new Promise((resolve) => { resolveFirstFetch = resolve; });
          }
          return Promise.resolve([]);
        },
      },
    });

    await withMockTimers(async ({ intervals, tick }) => {
      engine.Menu.Push('main');
      await Promise.resolve(); // onEnter's immediate refresh starts, but its fetch never resolves yet

      assert.equal(fetchCallCount, 1);

      tick(intervals[0]); // a poll tick while the first fetch is still pending
      await Promise.resolve();

      assert.equal(fetchCallCount, 1); // skipped -- sessionRefreshInFlight guard

      resolveFirstFetch([]);
      await Promise.resolve();
      await Promise.resolve();

      tick(intervals[0]); // now the guard is clear again
      await Promise.resolve();

      assert.equal(fetchCallCount, 2);

      engine.Menu.Pop();
    });
  });
});
