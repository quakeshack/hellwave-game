import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { EventBus, type ServerGameEventMap } from '../../../engine/common/EventBus.ts';
import { createInertModGameApi, createMutableEngineApi } from '../../../../test/support/entityMocks.ts';
import { serializableFieldsOf } from '../../../../test/support/serialization.ts';
import type { HellwaveServerEvents } from '../Events.ts';
import type { ServerGameAPI as HellwaveGame } from '../GameAPI.ts';

await import('../../id1/GameAPI.ts');

const { phases } = await import('../Phases.ts');
const hellwaveGameManagerModule = await import('../GameManager.ts');
const hellwavePlayerModule = await import('../entity/Player.ts');

const GameManager = hellwaveGameManagerModule.default;
const HellwavePlayer = hellwavePlayerModule.default;

type ServerEventMap = ServerGameEventMap & HellwaveServerEvents;

/** The manager with the step of a round that a test runs on its own. */
class TestManager extends GameManager {
  runNextRound(): void {
    this.startNextRound();
  }
}

/** An event bus that delivers and remembers everything that was published on it. */
class RecordingEventBus extends EventBus<ServerEventMap> {
  readonly published: unknown[][] = [];

  override publish<Name extends Extract<keyof ServerEventMap, string>>(eventName: Name, ...args: ServerEventMap[Name]): void {
    this.published.push([eventName, ...args]);
    super.publish(eventName, ...args);
  }
}

interface MockGameOverrides {
  readonly engine?: object;
  readonly startIntermission?: () => void;
}

/**
 * Create a plain player-shaped test stub.
 * @param overrides Optional player overrides.
 * @returns Player-like stub.
 */
function createPlayerStub(overrides: object = {}): InstanceType<typeof HellwavePlayer> {
  return Object.assign(Object.create(HellwavePlayer.prototype) as InstanceType<typeof HellwavePlayer>, {
    spectating: false,
    health: 100,
    putPlayerInServer() {
    },
  }, overrides);
}

/**
 * Create the minimal Hellwave game API surface used by the manager tests.
 * @param overrides Optional overrides.
 * @returns Mock game plus captured engine side effects.
 */
function createMockGame(overrides: MockGameOverrides = {}) {
  const { engine: engineOverrides = {}, ...gameOverrides } = overrides;
  const eventBus = new RecordingEventBus('test');
  const consolePrints: string[] = [];
  const broadcastPrints: string[] = [];
  const playTracks: number[] = [];
  const setCvars: Array<[string, string]> = [];

  const engine = createMutableEngineApi({
    eventBus,
    BroadcastPrint(message: string): void {
      broadcastPrints.push(message);
    },
    ConsolePrint(message: string): void {
      consolePrints.push(message);
    },
    PlayTrack(trackNumber: number): void {
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
    SetCvar(name: string, value: string): void {
      setCvars.push([name, value]);
    },
    ...engineOverrides,
  });

  const game = createInertModGameApi<HellwaveGame>({
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
  }, engine);

  return {
    game,
    published: eventBus.published,
    consolePrints,
    broadcastPrints,
    playTracks,
    setCvars,
  };
}

void describe('GameManager', () => {
  void test('declares the expected serializable runtime fields', () => {
    const { game } = createMockGame();
    const manager = new TestManager(game);

    const fields = serializableFieldsOf(GameManager);

    assert.ok(Array.isArray(fields));
    assert.ok(Object.isFrozen(fields));
    assert.deepEqual(fields, [
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
      'canHaveBossfight',
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
      canHaveBossfight: ['P', false],
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
    const { game, published, playTracks, setCvars } = createMockGame({
      engine: {
        GetClients() {
          return [
            { entity: activePlayer },
            { entity: spectator },
          ];
        },
      },
    });
    const manager = new TestManager(game);

    manager.round_number_limit = 4;
    manager.runNextRound();

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
    // Mirrors round_number into a Cvar.FLAG.SERVER cvar so the master-server settings sweep
    // (WebRTCDriver#GatherServerInfo) picks it up for the lobby session list.
    assert.deepEqual(setCvars, [['hw_round_current', '1']]);
  });

  void test('mirrors each subsequent round number into hw_round_current', () => {
    const { game, setCvars } = createMockGame();
    const manager = new TestManager(game);

    manager.round_number_limit = 4;
    manager.runNextRound();
    manager.runNextRound();
    manager.runNextRound();

    assert.deepEqual(setCvars, [
      ['hw_round_current', '1'],
      ['hw_round_current', '2'],
      ['hw_round_current', '3'],
    ]);
  });

  void test('switches to victory phase when the round limit is reached', () => {
    let intermissionCalls = 0;
    const { game, published, consolePrints } = createMockGame({
      startIntermission() {
        intermissionCalls += 1;
      },
    });
    const manager = new TestManager(game);

    manager.round_number = 3;
    manager.round_number_limit = 3;

    manager.runNextRound();

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
