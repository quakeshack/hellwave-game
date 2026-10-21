import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type Cvar from '../../../engine/common/Cvar.ts';
import { createMutableCvarStub } from '../../../../test/support/cvarStub.ts';
import { createInertEdict, createInertEngineApi } from '../../../../test/support/entityMocks.ts';
import { serializableFieldsOf } from '../../../../test/support/serialization.ts';

await import('../../id1/GameAPI.ts');

const { ServerGameAPI: Id1ServerGameAPI } = await import('../../id1/GameAPI.ts');
const { ServerGameAPI } = await import('../GameAPI.ts');
const hellwaveManagerModule = await import('../GameManager.ts');
const hellwavePlayerModule = await import('../entity/Player.ts');
const hellwaveStatsModule = await import('../helper/HellwaveStats.ts');

const GameManager = hellwaveManagerModule.default;
const HellwavePlayer = hellwavePlayerModule.default;
const HellwaveStats = hellwaveStatsModule.default;

type StaticCvars = typeof ServerGameAPI._cvars;

/**
 * Create the static cvar table used by Hellwave ServerGameAPI tests.
 * @param overrides Override values for selected cvars.
 * @returns Mock static cvar registry.
 */
function createStaticCvars(overrides: Partial<Record<keyof StaticCvars, Cvar>> = {}): Record<keyof StaticCvars, Cvar> {
  return {
    nomonster: createMutableCvarStub(0),
    fraglimit: createMutableCvarStub(20),
    timelimit: createMutableCvarStub(15),
    samelevel: createMutableCvarStub(0),
    noexit: createMutableCvarStub(0),
    skill: createMutableCvarStub(1),
    deathmatch: createMutableCvarStub(0),
    coop: createMutableCvarStub(0),
    rounds: createMutableCvarStub(12),
    roundCurrent: createMutableCvarStub(0),
    quiettime: createMutableCvarStub(15),
    normaltime: createMutableCvarStub(90),
    maxmonstersalive: createMutableCvarStub(20),
    debug_spawnpoints: createMutableCvarStub(0),
    ...overrides,
  } as Record<keyof StaticCvars, Cvar>;
}

/**
 * Create the minimal server engine surface required by Hellwave ServerGameAPI tests.
 * @returns Mock server engine.
 */
function createMockServerEngine(): ReturnType<typeof createInertEngineApi> {
  const cvars: Record<string, Cvar> = {
    teamplay: createMutableCvarStub(0),
    sv_gravity: createMutableCvarStub(800),
    sv_nextmap: createMutableCvarStub(0),
  };

  return createInertEngineApi({
    GetCvar(name: string): Cvar {
      return cvars[name] ?? createMutableCvarStub(0);
    },
    eventBus: {
      subscribe() {
        return () => {};
      },
    },
    maxplayers: 1,
  });
}

/**
 * Create a player-shaped Hellwave runtime stub.
 * @param overrides Optional overrides.
 * @returns Player-like stub.
 */
function createPlayerStub(overrides: object = {}): InstanceType<typeof HellwavePlayer> {
  return Object.assign(Object.create(HellwavePlayer.prototype) as InstanceType<typeof HellwavePlayer>, {
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
    assert.deepEqual(serializableFieldsOf(ServerGameAPI), ['manager']);

    const serialized = gameAPI.serialize();

    assert.deepEqual(Object.keys(serialized), [
      ...(serializableFieldsOf(Id1ServerGameAPI) ?? []),
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
    assert.deepEqual(Object.keys(serialized.manager[1]), serializableFieldsOf(GameManager));
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
        rounds: createMutableCvarStub(20),
        coop: createMutableCvarStub(1),
        deathmatch: createMutableCvarStub(1),
        skill: createMutableCvarStub(9),
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
      assert.equal(ServerGameAPI._cvars.coop?.value, 1);
      assert.equal(ServerGameAPI._cvars.deathmatch?.value, 0);
      assert.equal(ServerGameAPI._cvars.skill?.value, 3);
      assert.equal(precachedResources, true);
      assert.equal(initializedNextMap, true);
    } finally {
      ServerGameAPI._cvars = originalCvars;
    }
  });

  void test('forwards player lifecycle hooks to the Hellwave player and manager', () => {
    const gameAPI = new ServerGameAPI(createMockServerEngine());
    const calls: unknown[] = [];
    const playerEntity = createPlayerStub({
      connected() {
        calls.push('player.connected');
      },
      disconnected() {
        calls.push('player.disconnected');
      },
    });
    const clientEdict = Object.assign(createInertEdict(), { entity: playerEntity });

    gameAPI.manager.clientConnected = (player: unknown) => {
      calls.push(['manager.connected', player]);
    };
    gameAPI.manager.clientDisconnected = (player: unknown) => {
      calls.push(['manager.disconnected', player]);
    };
    gameAPI.manager.clientBeing = (player: unknown) => {
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
