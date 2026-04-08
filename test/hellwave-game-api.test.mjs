import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

await import('../../id1/GameAPI.ts');

const { ServerGameAPI: Id1ServerGameAPI } = await import('../../id1/GameAPI.ts');
const { ServerGameAPI } = await import('../GameAPI.ts');
const hellwaveManagerModule = await import('../GameManager.ts');
const hellwavePlayerModule = await import('../entity/Player.ts');
const hellwaveStatsModule = await import('../helper/HellwaveStats.ts');

const GameManager = hellwaveManagerModule.default;
const HellwavePlayer = hellwavePlayerModule.default;
const HellwaveStats = hellwaveStatsModule.default;

/**
 * Create a mutable mock cvar.
 * @param {number|string} initialValue Initial cvar value.
 * @returns {object} Mock cvar.
 */
function createMockCvar(initialValue) {
  const normalizedValue = Number(initialValue);

  return {
    value: normalizedValue,
    string: String(normalizedValue),
    set(nextValue) {
      this.value = Number(nextValue);
      this.string = String(this.value);
    },
    free() {
    },
  };
}

/**
 * Create the static cvar table used by Hellwave ServerGameAPI tests.
 * @param {object} overrides Override values for selected cvars.
 * @returns {object} Mock static cvar registry.
 */
function createStaticCvars(overrides = {}) {
  return {
    nomonster: createMockCvar(0),
    fraglimit: createMockCvar(20),
    timelimit: createMockCvar(15),
    samelevel: createMockCvar(0),
    noexit: createMockCvar(0),
    skill: createMockCvar(1),
    deathmatch: createMockCvar(0),
    coop: createMockCvar(0),
    rounds: createMockCvar(12),
    quiettime: createMockCvar(15),
    normaltime: createMockCvar(90),
    maxmonstersalive: createMockCvar(20),
    debug_spawnpoints: createMockCvar(0),
    ...overrides,
  };
}

/**
 * Create the minimal server engine surface required by Hellwave ServerGameAPI tests.
 * @param {object} overrides Optional engine overrides.
 * @returns {object} Mock server engine.
 */
function createMockServerEngine(overrides = {}) {
  const cvars = {
    teamplay: createMockCvar(0),
    sv_gravity: createMockCvar(800),
    sv_nextmap: createMockCvar(0),
  };

  return {
    GetCvar(name) {
      return cvars[name] ?? createMockCvar(0);
    },
    eventBus: {
      subscribe() {
        return () => {};
      },
    },
    maxplayers: 1,
    ...overrides,
  };
}

/**
 * Create a player-shaped Hellwave runtime stub.
 * @param {object} overrides Optional overrides.
 * @returns {object} Player-like stub.
 */
function createPlayerStub(overrides = {}) {
  return Object.assign(Object.create(HellwavePlayer.prototype), {
    connected() {
    },
    disconnected() {
    },
  }, overrides);
}

void describe('Hellwave ServerGameAPI serialization', () => {
  void test('serializes the round manager in addition to the id1 game state', () => {
    const gameAPI = new ServerGameAPI(createMockServerEngine());

    assert.equal(gameAPI.stats instanceof HellwaveStats, true);
    assert.equal(gameAPI.manager instanceof GameManager, true);
    assert.deepEqual(ServerGameAPI.serializableFields, ['manager']);

    const serialized = gameAPI.serialize();

    assert.deepEqual(Object.keys(serialized), [
      ...Id1ServerGameAPI.serializableFields,
      'manager',
    ]);
    assert.deepEqual(serialized.stats, ['S', {
      monsters_total: ['P', 0],
      monsters_killed: ['P', 0],
      secrets_total: ['P', 0],
      secrets_found: ['P', 0],
      round_current: ['P', 0],
      round_total: ['P', 0],
      squad_standing: ['P', 0],
      squad_total: ['P', 0],
      round_monsters_limit: ['P', 0],
      phase: ['P', 'waiting'],
      phase_ending_time: ['P', 0],
    }]);
    assert.equal(serialized.manager[0], 'S');
    assert.deepEqual(Object.keys(serialized.manager[1]), GameManager.serializableFields);
  });
});

void describe('Hellwave ServerGameAPI lifecycle', () => {
  void test('subscribes the round manager during init and clamps the round limit', () => {
    const originalCvars = ServerGameAPI._cvars;
    let subscribed = 0;
    let precachedResources = false;
    let initializedNextMap = false;

    try {
      ServerGameAPI._cvars = createStaticCvars({
        rounds: createMockCvar(20),
        coop: createMockCvar(1),
        deathmatch: createMockCvar(1),
        skill: createMockCvar(9),
      });

      const gameAPI = new ServerGameAPI(createMockServerEngine());
      gameAPI.manager.subscribeToEvents = () => {
        subscribed += 1;
      };
      gameAPI._precacheResources = () => {
        precachedResources = true;
      };
      gameAPI._initNextMap = () => {
        initializedNextMap = true;
      };

      gameAPI.init('hw_e1m2', 7);

      assert.equal(gameAPI.mapname, 'hw_e1m2');
      assert.equal(gameAPI.serverflags, 7);
      assert.equal(subscribed, 1);
      assert.equal(gameAPI.manager.round_number_limit, 12);
      assert.equal(ServerGameAPI._cvars.coop.value, 1);
      assert.equal(ServerGameAPI._cvars.deathmatch.value, 0);
      assert.equal(ServerGameAPI._cvars.skill.value, 3);
      assert.equal(precachedResources, true);
      assert.equal(initializedNextMap, true);
    } finally {
      ServerGameAPI._cvars = originalCvars;
    }
  });

  void test('forwards player lifecycle hooks to the Hellwave player and manager', () => {
    const gameAPI = new ServerGameAPI(createMockServerEngine());
    const calls = [];
    const playerEntity = createPlayerStub({
      connected() {
        calls.push('player.connected');
      },
      disconnected() {
        calls.push('player.disconnected');
      },
    });
    const clientEdict = { entity: playerEntity };

    gameAPI.manager.clientConnected = (player) => {
      calls.push(['manager.connected', player]);
    };
    gameAPI.manager.clientDisconnected = (player) => {
      calls.push(['manager.disconnected', player]);
    };
    gameAPI.manager.clientBeing = (player) => {
      calls.push(['manager.begin', player]);
    };

    gameAPI.ClientConnect(clientEdict);
    gameAPI.ClientDisconnect(clientEdict);
    gameAPI.ClientBegin(clientEdict);

    assert.deepEqual(calls, [
      'player.connected',
      ['manager.connected', playerEntity],
      'player.disconnected',
      ['manager.disconnected', playerEntity],
      ['manager.begin', playerEntity],
    ]);
  });
});
