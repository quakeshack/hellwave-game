import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

await import('../../id1/GameAPI.ts');

const { clientEvent, clientEventName, formatMoney } = await import('../Defs.ts');
const { phases } = await import('../Phases.ts');
const hellwaveStatsModule = await import('../helper/HellwaveStats.ts');
const hellwaveSyncModule = await import('../client/Sync.ts');

const HellwaveStats = hellwaveStatsModule.default;
const { HellwaveStatsInfo } = hellwaveSyncModule;

/**
 * Create an event bus with subscribe/publish support.
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
 * Create the minimal engine API surface used by the Hellwave stats tests.
 * @returns {object} Mock engine API.
 */
function createServerEngineAPI() {
  const eventBus = createEventBus();
  const broadcasts = [];
  const dispatches = [];

  return {
    eventBus,
    broadcasts,
    dispatches,
    BroadcastClientEvent(...args) {
      broadcasts.push(args);
    },
    DispatchClientEvent(...args) {
      dispatches.push(args);
    },
  };
}

/**
 * Create the minimal client engine API surface used by HellwaveStatsInfo.
 * @returns {object} Mock client engine API.
 */
function createClientEngineAPI() {
  return {
    eventBus: createEventBus(),
  };
}

void describe('Hellwave defs', () => {
  void test('exposes Hellwave client events and money formatting', () => {
    assert.equal(clientEvent.STATS_UPDATED, 3);
    assert.equal(clientEvent.MONEY_UPDATE, 200);
    assert.equal(clientEvent.ROUND_TIME, 201);
    assert.equal(clientEvent.ROUND_PHASE, 202);
    assert.equal(clientEvent.NAV_HINT, 203);
    assert.equal(clientEventName(clientEvent.NAV_HINT), 'client.event-received.203');
    assert.equal(formatMoney(125.6), 'Q126');
  });
});

void describe('HellwaveStats', () => {
  void test('tracks Hellwave-specific serializable fields and inherited stat slots', () => {
    const engineAPI = createServerEngineAPI();
    const stats = new HellwaveStats({}, engineAPI);

    assert.ok(Array.isArray(HellwaveStats.serializableFields));
    assert.ok(Object.isFrozen(HellwaveStats.serializableFields));
    assert.deepEqual(HellwaveStats.serializableFields, [
      'round_current',
      'round_total',
      'squad_standing',
      'squad_total',
      'round_monsters_limit',
      'phase',
      'phase_ending_time',
    ]);

    assert.deepEqual(stats._serializer.serialize(), {
      monsters_killed: ['P', 0],
      monsters_total: ['P', 0],
      phase: ['P', phases.waiting],
      phase_ending_time: ['P', 0],
      round_current: ['P', 0],
      round_monsters_limit: ['P', 0],
      round_total: ['P', 0],
      secrets_found: ['P', 0],
      secrets_total: ['P', 0],
      squad_standing: ['P', 0],
      squad_total: ['P', 0],
    });
  });

  void test('publishes round and squad updates and sends extended slots to clients', () => {
    const engineAPI = createServerEngineAPI();
    const stats = new HellwaveStats({}, engineAPI);
    const playerEntity = { edict: { num: 7 } };

    stats.subscribeToEvents();

    engineAPI.eventBus.publish('game.round.started', 3, 12, 48);
    engineAPI.eventBus.publish('game.phase.changed', phases.quiet);
    engineAPI.eventBus.publish('game.phase.endingtime', 30);
    assert.equal(stats.updateSquadStats(2, 4), stats);

    stats.sendToPlayer(playerEntity);

    assert.deepEqual(engineAPI.broadcasts, [
      [true, clientEvent.STATS_UPDATED, 'round_current', 3],
      [true, clientEvent.STATS_UPDATED, 'round_total', 12],
      [true, clientEvent.STATS_UPDATED, 'round_monsters_limit', 48],
      [true, clientEvent.STATS_UPDATED, 'monsters_total', 0],
      [true, clientEvent.STATS_UPDATED, 'monsters_killed', 0],
      [true, clientEvent.STATS_UPDATED, 'phase', phases.quiet],
      [true, clientEvent.STATS_UPDATED, 'phase_ending_time', 30],
      [true, clientEvent.STATS_UPDATED, 'squad_standing', 2],
      [true, clientEvent.STATS_UPDATED, 'squad_total', 4],
    ]);

    assert.deepEqual(engineAPI.dispatches, [
      [playerEntity.edict, true, clientEvent.STATS_INIT, 'monsters_total', 0],
      [playerEntity.edict, true, clientEvent.STATS_INIT, 'monsters_killed', 0],
      [playerEntity.edict, true, clientEvent.STATS_INIT, 'secrets_total', 0],
      [playerEntity.edict, true, clientEvent.STATS_INIT, 'secrets_found', 0],
      [playerEntity.edict, true, clientEvent.STATS_INIT, 'round_total', 12],
      [playerEntity.edict, true, clientEvent.STATS_INIT, 'round_current', 3],
      [playerEntity.edict, true, clientEvent.STATS_INIT, 'squad_standing', 2],
      [playerEntity.edict, true, clientEvent.STATS_INIT, 'squad_total', 4],
      [playerEntity.edict, true, clientEvent.STATS_INIT, 'phase', phases.quiet],
      [playerEntity.edict, true, clientEvent.STATS_INIT, 'phase_ending_time', 30],
      [playerEntity.edict, true, clientEvent.STATS_INIT, 'round_monsters_limit', 48],
    ]);
  });
});

void describe('HellwaveStatsInfo', () => {
  void test('updates hellwave-specific slots from client stat events', () => {
    const engineAPI = createClientEngineAPI();
    const stats = new HellwaveStatsInfo(engineAPI);

    engineAPI.eventBus.publish(clientEventName(clientEvent.STATS_INIT), 'round_total', 12);
    engineAPI.eventBus.publish(clientEventName(clientEvent.STATS_INIT), 'round_current', 3);
    engineAPI.eventBus.publish(clientEventName(clientEvent.STATS_INIT), 'phase', phases.normal);
    engineAPI.eventBus.publish(clientEventName(clientEvent.STATS_UPDATED), 'squad_standing', 2);
    engineAPI.eventBus.publish(clientEventName(clientEvent.STATS_UPDATED), 'round_monsters_limit', 48);
    engineAPI.eventBus.publish(clientEventName(clientEvent.STATS_UPDATED), 'phase_ending_time', 30);
    engineAPI.eventBus.publish(clientEventName(clientEvent.STATS_UPDATED), 'monsters_killed', 7);

    assert.equal(stats.round_total, 12);
    assert.equal(stats.round_current, 3);
    assert.equal(stats.phase, phases.normal);
    assert.equal(stats.squad_standing, 2);
    assert.equal(stats.round_monsters_limit, 48);
    assert.equal(stats.phase_ending_time, 30);
    assert.equal(stats.monsters_killed, 7);
  });

  void test('parses numeric strings for hellwave and inherited id1 stat slots', () => {
    const engineAPI = createClientEngineAPI();
    const stats = new HellwaveStatsInfo(engineAPI);

    engineAPI.eventBus.publish(clientEventName(clientEvent.STATS_INIT), 'round_total', '12');
    engineAPI.eventBus.publish(clientEventName(clientEvent.STATS_UPDATED), 'phase_ending_time', ' 30 ');
    engineAPI.eventBus.publish(clientEventName(clientEvent.STATS_UPDATED), 'monsters_killed', '7');
    engineAPI.eventBus.publish(clientEventName(clientEvent.STATS_UPDATED), 'round_current', 'not-a-number');

    assert.equal(stats.round_total, 12);
    assert.equal(stats.phase_ending_time, 30);
    assert.equal(stats.monsters_killed, 7);
    assert.equal(stats.round_current, 0);
  });
});
