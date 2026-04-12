import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

await import('../../id1/GameAPI.ts');

const { phases } = await import('../Phases.ts');
const hellwaveGameManagerModule = await import('../GameManager.ts');
const hellwavePlayerModule = await import('../entity/Player.ts');

const GameManager = hellwaveGameManagerModule.default;
const HellwavePlayer = hellwavePlayerModule.default;

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
 * Create a plain player-shaped test stub.
 * @param {object} overrides Optional player overrides.
 * @returns {object} Player-like stub.
 */
function createPlayerStub(overrides = {}) {
  return Object.assign(Object.create(HellwavePlayer.prototype), {
    spectating: false,
    health: 100,
    putPlayerInServer() {
    },
  }, overrides);
}

/**
 * Create the minimal Hellwave game API surface used by the manager tests.
 * @param {object} overrides Optional overrides.
 * @returns {object} Mock game plus captured engine side effects.
 */
function createMockGame(overrides = {}) {
  const { engine: engineOverrides = {}, ...gameOverrides } = overrides;
  const eventBus = createEventBus();
  const published = [];
  const consolePrints = [];
  const broadcastPrints = [];
  const playTracks = [];

  const engine = {
    eventBus: {
      subscribe: eventBus.subscribe,
      publish(eventName, ...args) {
        published.push([eventName, ...args]);
        eventBus.publish(eventName, ...args);
      },
    },
    BroadcastPrint(message) {
      broadcastPrints.push(message);
    },
    ConsolePrint(message) {
      consolePrints.push(message);
    },
    PlayTrack(trackNumber) {
      playTracks.push(trackNumber);
    },
    FindAllByFilter() {
      return [];
    },
    GetClients() {
      return [];
    },
    ChangeLevel() {
    },
    ...engineOverrides,
  };

  const game = {
    engine,
    time: 10,
    quiettime: 15,
    normaltime: 90,
    maxmonstersalive: 0,
    intermission_running: 0,
    gameover: false,
    mapname: 'hw_e1m2',
    stats: {
      monsters_total: 0,
      monsters_killed: 0,
      updateSquadStats() {
      },
    },
    worldspawn: {
      sounds: 2,
    },
    startIntermission() {
    },
    loadNextMap() {
    },
    ...gameOverrides,
  };

  return {
    game,
    published,
    consolePrints,
    broadcastPrints,
    playTracks,
  };
}

void describe('GameManager', () => {
  void test('declares the expected serializable runtime fields', () => {
    const { game } = createMockGame();
    const manager = new GameManager(game);

    assert.ok(Array.isArray(GameManager.serializableFields));
    assert.ok(Object.isFrozen(GameManager.serializableFields));
    assert.deepEqual(GameManager.serializableFields, [
      'spawnpoints',
      'spawn_next',
      'phase',
      'phase_ending_time',
      'round_number',
      'round_number_limit',
      'round_monsters_limit',
      'next_hint_time',
      'designed_buyzone',
      'available_goodies',
      'available_goodies_quad',
      'gameInitialized',
    ]);

    assert.deepEqual(manager._serializer.serialize(), {
      available_goodies: ['P', 0],
      available_goodies_quad: ['P', 0],
      designed_buyzone: ['P', null],
      gameInitialized: ['P', false],
      next_hint_time: ['P', 0],
      phase: ['P', phases.waiting],
      phase_ending_time: ['P', 0],
      round_monsters_limit: ['P', 0],
      round_number: ['P', 0],
      round_number_limit: ['P', 0],
      spawn_next: ['P', 0],
      spawnpoints: ['A', []],
    });
  });

  void test('starts the next round, enters quiet phase, and respawns spectators', () => {
    let spectatorRespawns = 0;
    const spectator = createPlayerStub({
      spectating: true,
      putPlayerInServer() {
        spectatorRespawns += 1;
      },
    });
    const activePlayer = createPlayerStub();
    const { game, published, playTracks } = createMockGame({
      engine: {
        GetClients() {
          return [
            { entity: activePlayer },
            { entity: spectator },
          ];
        },
      },
    });
    const manager = new GameManager(game);

    manager.round_number_limit = 4;
    manager.startNextRound();

    assert.equal(manager.round_number, 1);
    assert.equal(manager.round_monsters_limit, 20);
    assert.equal(manager.available_goodies, 4);
    assert.equal(manager.available_goodies_quad, 0);
    assert.equal(manager.phase, phases.quiet);
    assert.equal(manager.phase_ending_time, 25);
    assert.equal(manager.next_hint_time, 13);
    assert.equal(spectatorRespawns, 1);
    assert.deepEqual(playTracks, [0]);
    assert.deepEqual(published, [
      ['game.round.started', 1, 4, 20],
      ['game.phase.changed', phases.quiet],
      ['game.phase.endingtime', 25],
    ]);
  });

  void test('switches to victory phase when the round limit is reached', () => {
    let intermissionCalls = 0;
    const { game, published, consolePrints } = createMockGame({
      startIntermission() {
        intermissionCalls += 1;
      },
    });
    const manager = new GameManager(game);

    manager.round_number = 3;
    manager.round_number_limit = 3;

    manager.startNextRound();

    assert.equal(intermissionCalls, 1);
    assert.equal(manager.phase, phases.victory);
    assert.equal(manager.phase_ending_time, 40);
    assert.deepEqual(consolePrints, ['Maximum number of rounds reached.\n']);
    assert.deepEqual(published, [
      ['game.phase.changed', phases.victory],
      ['game.phase.endingtime', 0],
    ]);
  });
});
