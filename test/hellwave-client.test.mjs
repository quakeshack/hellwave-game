import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import Vector from '../../../shared/Vector.ts';
import { createMockClientEngine, createMockSound } from '../../id1/test/client/fixtures.ts';

await import('../../id1/GameAPI.ts');

const { clientEvent, clientEventName, items } = await import('../Defs.ts');
const { phases } = await import('../Phases.ts');
const clientApiModule = await import('../client/ClientAPI.ts');
const hudModule = await import('../client/HUD.ts');

const { ClientGameAPI } = clientApiModule;
const HellwaveHUD = hudModule.default;

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
  void test('reuses the inherited hudStats getter for Hellwave-specific stats', () => {
    const engine = createMockClientEngine();
    const game = createHellwaveGame(engine);
    const hud = new HellwaveHUD(game, engine);

    hud.init();

    engine.eventBus.publish(clientEventName(clientEvent.STATS_UPDATED), 'round_total', 6);
    engine.eventBus.publish(clientEventName(clientEvent.STATS_UPDATED), 'phase', phases.quiet);

    assert.equal(hud.hudStats.round_total, 6);
    assert.equal(hud.hudStats.phase, phases.quiet);
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
