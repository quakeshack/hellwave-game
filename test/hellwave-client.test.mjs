import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import Vector from '../../../shared/Vector.ts';

await import('../../id1/GameAPI.ts');

const { clientEvent, clientEventName, items } = await import('../Defs.ts');
const { phases } = await import('../Phases.ts');
const clientApiModule = await import('../client/ClientAPI.ts');
const hudModule = await import('../client/HUD.ts');

const { ClientGameAPI } = clientApiModule;
const HellwaveHUD = hudModule.default;

/**
 * Create an event bus with subscribe and publish support.
 * @returns {object} Mock event bus.
 */
function createEventBus() {
  const listeners = new Map();

  return {
    subscribe(eventName, handler) {
      const handlers = listeners.get(eventName) ?? [];
      handlers.push(handler);
      listeners.set(eventName, handlers);

      return () => {
        const currentHandlers = listeners.get(eventName) ?? [];
        listeners.set(eventName, currentHandlers.filter((currentHandler) => currentHandler !== handler));
      };
    },

    publish(eventName, ...args) {
      for (const handler of listeners.get(eventName) ?? []) {
        handler(...args);
      }
    },
  };
}

/**
 * Create a mock texture with the surface expected by the client HUD.
 * @param {string} name Debug name.
 * @param {number} width Texture width.
 * @param {number} height Texture height.
 * @returns {object} Mock texture.
 */
function createMockTexture(name, width = 24, height = 24) {
  return {
    name,
    width,
    height,
    freed: false,
    lockedTextureMode: null,
    free() {
      this.freed = true;
    },
    lockTextureMode(mode) {
      this.lockedTextureMode = mode;
      return this;
    },
    wrapClamped() {
      return this;
    },
  };
}

/**
 * Create a mock sound object.
 * @param {string} name Debug name.
 * @returns {object} Mock sound.
 */
function createMockSound(name) {
  return {
    name,
    playCount: 0,
    play() {
      this.playCount += 1;
    },
  };
}

/**
 * Create a minimal client engine API mock for Hellwave HUD and client API tests.
 * @param {object} overrides Override values.
 * @returns {object} Mock engine API.
 */
function createMockClientEngine(overrides = {}) {
  const eventBus = createEventBus();
  const drawStrings = [];
  const drawPics = [];
  const rocketTrails = [];
  const contentShifts = [];
  const consoleCommands = new Map();
  const sounds = [];
  const cvarSets = [];

  return {
    eventBus,
    drawStrings,
    drawPics,
    rocketTrails,
    contentShifts,
    sounds,
    cvarSets,
    consoleCommands,
    DrawPic(...args) {
      drawPics.push(args);
    },
    DrawRect() {
    },
    DrawString(...args) {
      drawStrings.push(args);
    },
    LoadPicFromWad(name) {
      return createMockTexture(name);
    },
    LoadPicFromLump(name) {
      return createMockTexture(name, 64, 16);
    },
    LoadPicFromFile(name) {
      return Promise.resolve(createMockTexture(name, 320, 200));
    },
    LoadSound(name) {
      const sound = createMockSound(name);
      sounds.push(sound);
      return sound;
    },
    RegisterCommand(name, handler) {
      consoleCommands.set(name, handler);
    },
    UnregisterCommand(name) {
      consoleCommands.delete(name);
    },
    ConsoleDebug() {
    },
    ConsoleError() {
    },
    ConsolePrint() {
    },
    ConsoleWarning() {
    },
    ContentShift(...args) {
      contentShifts.push(args);
    },
    IndexToRGB() {
      return [1.0, 1.0, 1.0];
    },
    ModForName(name) {
      return { name };
    },
    AllocDlight() {
      return {};
    },
    WorldToScreen(origin) {
      return new Vector(origin[0], origin[1], 0.0);
    },
    *GetVisibleEntities(filter = null) {
      const visibleEntities = overrides.visibleEntities ?? [];

      for (const entity of visibleEntities) {
        if (filter === null || filter(entity)) {
          yield entity;
        }
      }
    },
    RocketTrail(start, end, type) {
      rocketTrails.push({ start, end, type });
    },
    AppendConsoleText() {
    },
    GetCvar(name) {
      return {
        set(value) {
          cvarSets.push([name, value]);
        },
      };
    },
    VID: {
      width: 320,
      height: 200,
    },
    SCR: {
      viewsize: 120,
    },
    CL: {
      gametime: 0,
      frametime: 0.1,
      entityNum: 1,
      intermission: false,
      levelname: 'hw_e1m2',
      maxclients: 2,
      time: 0,
      viewangles: new Vector(),
      vieworigin: new Vector(),
      score(index) {
        if (index === 1) {
          return {
            isActive: true,
            frags: 0,
            name: 'Teammate',
            ping: 20,
            colors: 0,
          };
        }

        return {
          isActive: false,
          frags: 0,
          name: '',
          ping: 0,
          colors: 0,
        };
      },
    },
    ...overrides,
  };
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

void describe('Hellwave HUD', () => {
  void test('plays phase sounds, updates money, and shows the spectator status message', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.0;

    try {
      const engine = createMockClientEngine();
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
      assert.ok(engine.drawStrings.some(([, , text]) => text === 'Spectating... Waiting for next round'));
    } finally {
      Math.random = originalRandom;
    }
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
});
