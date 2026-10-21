import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import Vector from '../../../shared/Vector.ts';

import type { ScheduledThinkCallback } from '../../id1/entity/BaseEntity.ts';
import type { Sub } from '../../id1/entity/Subs.ts';
import type { ServerGameAPI as HellwaveGame } from '../GameAPI.ts';
import { createInertEdict, createInertModGameApi, createMutableEngineApi, createSubStub } from '../../../../test/support/entityMocks.ts';
import { serializableFieldsOf } from '../../../../test/support/serialization.ts';

await import('../../id1/GameAPI.ts');

const { formatMoney, items, solid } = await import('../Defs.ts');
const { phases } = await import('../Phases.ts');
const hellwaveItemsModule = await import('../entity/Items.ts');
const hellwaveZonesModule = await import('../entity/Zones.ts');
const { LightEntity, TeleportEffectEntity } = await import('../../id1/entity/Misc.ts');
const playerModule = await import('../../id1/entity/Player.ts');

const { HellwaveBackpackEntity, HellwaveHealthItemEntity } = hellwaveItemsModule;
const { BuyZoneEntity, BuyZoneShuttersEntity, MonstersSpawnZoneEntity, PlayersSpawnZoneEntity } = hellwaveZonesModule;
const { PlayerEntity } = playerModule;

type Player = InstanceType<typeof PlayerEntity>;

/** The player a buy zone touches, which Hellwave adds the time of the last touch to. */
type BuyZonePlayer = Player & { buyzone_time: number };

interface SpawnCall {
  readonly classname: string;
  readonly initialData: Record<string, unknown>;
}

/** A backpack that lets a test run what a pickup lists. */
class TestBackpack extends HellwaveBackpackEntity {
  collectItems(player: Player, priorItems: number): string[] {
    return this._collectItems(player, priorItems);
  }
}

/** A health item that lets a test run the touch aftermath and replace the movement helper. */
class TestHealthItem extends HellwaveHealthItemEntity {
  afterTouch(player: Player): void {
    this._afterTouch(player);
  }

  useSub(sub: Sub): void {
    this._sub = sub;
  }

  get originalModel(): string | null {
    return this._model_original;
  }
}

interface MockGameOverrides {
  readonly time?: number;
  readonly manager?: { phase: HellwaveGame['manager']['phase']; phase_ending_time: number; spawnpoints?: unknown[] };
  readonly engine?: object;
}

/**
 * Create the minimal game API surface required by the Hellwave items and zones tests.
 * @param overrides Optional overrides.
 * @returns Mock game API.
 */
function createMockGameAPI(overrides: MockGameOverrides = {}): HellwaveGame {
  const engine = createMutableEngineApi({
    ConsoleWarning() {
    },
    SpawnEntity() {
      return null;
    },
    GetEdictById() {
      return { entity: null };
    },
    maxplayers: 0,
    ...overrides.engine,
  });

  return createInertModGameApi<HellwaveGame>({
    time: overrides.time ?? 0,
    debug_spawnpoints: 0,
    manager: overrides.manager ?? {
      phase: phases.waiting,
      phase_ending_time: 0,
      spawnpoints: [],
    },
  }, engine);
}

/**
 * Create a player-shaped runtime stub that satisfies instanceof PlayerEntity checks.
 * @param edictNum Edict slot number.
 * @returns Player-like test entity.
 */
function createPlayerStub(edictNum: number): BuyZonePlayer {
  const player = Object.create(PlayerEntity.prototype) as BuyZonePlayer;

  Object.defineProperty(player, 'edict', {
    value: Object.assign(createInertEdict(), { num: edictNum }),
    writable: true,
    configurable: true,
  });

  player.origin = new Vector();
  player.buyzone_time = 0;
  player.setOrigin = function setOrigin(this: Player, origin: Vector) {
    this.origin = origin.copy();
  };

  return player;
}

/**
 * The entities a zone looks up by field, as the lookup hands them out.
 * @param entities The entities.
 * @returns A function answering with them.
 */
function foundEntities<T>(entities: T[]): () => IterableIterator<T> {
  return () => entities.values();
}

void describe('HellwaveBackpackEntity', () => {
  void test('serializes only the added money field and appends formatted money labels', () => {
    const backpack = new TestBackpack(null, createMockGameAPI()).initializeEntity();

    assert.deepEqual(serializableFieldsOf(HellwaveBackpackEntity), ['money']);

    backpack.money = 250;
    assert.deepEqual(backpack.collectItems(createPlayerStub(1), 0), [formatMoney(250)]);

    backpack.money = 0;
    assert.deepEqual(backpack.collectItems(createPlayerStub(1), 0), []);
  });

  void test('forwards the pre-pickup item flags so an already owned weapon is not announced again', () => {
    const backpack = new TestBackpack(null, createMockGameAPI()).initializeEntity();
    backpack.items = items.IT_SHOTGUN;
    backpack.money = 250;

    assert.deepEqual(backpack.collectItems(createPlayerStub(1), 0), ['Shotgun', formatMoney(250)]);
    assert.deepEqual(backpack.collectItems(createPlayerStub(1), items.IT_SHOTGUN), [formatMoney(250)]);
  });
});

void describe('HellwaveHealthItemEntity', () => {
  void test('delays megahealth decay until the quiet phase ends', () => {
    const scheduled: Array<{ nextThink: number; callback: ScheduledThinkCallback<typeof entity> }> = [];
    let usedTargetsWith: unknown = null;
    let removed = false;
    const player = createPlayerStub(1);
    const entity = new TestHealthItem(null, createMockGameAPI({
      time: 10,
      manager: {
        phase: phases.quiet,
        phase_ending_time: 30,
      },
    })).initializeEntity();

    entity.spawnflags = HellwaveHealthItemEntity.H_MEGA;
    entity.model = 'maps/b_bh100.bsp';
    entity.useSub(createSubStub({
      useTargets(activator) {
        usedTargetsWith = activator;
      },
    }));
    entity._scheduleThink = function _scheduleThink(nextThink, callback) {
      scheduled.push({ nextThink, callback });
    };
    entity.remove = function remove() {
      removed = true;
    };

    entity.afterTouch(player);

    assert.equal(entity.solid, solid.SOLID_NOT);
    assert.equal(entity.originalModel, 'maps/b_bh100.bsp');
    assert.equal(entity.model, null);
    assert.equal(entity.owner, player);
    assert.equal(usedTargetsWith, player);
    assert.equal(scheduled.length, 1);
    assert.equal(scheduled[0].nextThink, 35);
    assert.equal(removed, false);
  });

  void test('uses the current game time for megahealth decay outside quiet phase', () => {
    const scheduled: Array<{ nextThink: number; callback: ScheduledThinkCallback<typeof entity> }> = [];
    const entity = new TestHealthItem(null, createMockGameAPI({
      time: 10,
      manager: {
        phase: phases.normal,
        phase_ending_time: 30,
      },
    })).initializeEntity();

    entity.spawnflags = HellwaveHealthItemEntity.H_MEGA;
    entity.useSub(createSubStub());
    entity._scheduleThink = function _scheduleThink(nextThink, callback) {
      scheduled.push({ nextThink, callback });
    };

    entity.afterTouch(createPlayerStub(1));

    assert.equal(scheduled.length, 1);
    assert.equal(scheduled[0].nextThink, 15);
  });

  void test('removes non-mega health immediately after pickup', () => {
    let removed = false;
    const entity = new TestHealthItem(null, createMockGameAPI()).initializeEntity();

    entity.spawnflags = HellwaveHealthItemEntity.H_NORMAL;
    entity.useSub(createSubStub());
    entity.remove = function remove() {
      removed = true;
    };

    entity.afterTouch(createPlayerStub(1));

    assert.equal(removed, true);
  });
});

void describe('BuyZoneEntity', () => {
  void test('records player presence during quiet phase without teleporting them', () => {
    const spawnCalls: SpawnCall[] = [];
    const player = createPlayerStub(2);
    const zone = new BuyZoneEntity(null, createMockGameAPI({
      time: 12,
      manager: {
        phase: phases.quiet,
        phase_ending_time: 50,
      },
      engine: {
        SpawnEntity(classname: string, initialData: Record<string, unknown>) {
          spawnCalls.push({ classname, initialData });
          return null;
        },
      },
    })).initializeEntity();

    zone.touch(player);

    assert.equal(player.buyzone_time, 12);
    assert.equal(zone._playerInsideTime[2], 12);
    assert.equal(spawnCalls.length, 0);
  });

  void test('teleports players out immediately when touching outside quiet phase', () => {
    const spawnCalls: SpawnCall[] = [];
    const player = createPlayerStub(1);
    const spawnzone = new PlayersSpawnZoneEntity(null, createMockGameAPI()).initializeEntity();
    const targetPoint = new Vector(100, 200, 300);
    const zone = new BuyZoneEntity(null, createMockGameAPI({
      time: 12,
      manager: {
        phase: phases.normal,
        phase_ending_time: 50,
      },
      engine: {
        SpawnEntity(classname: string, initialData: Record<string, unknown>) {
          spawnCalls.push({ classname, initialData });
          return null;
        },
      },
    })).initializeEntity();

    spawnzone.spawnpoints = [targetPoint];
    zone.target = 'buyzone_links';
    zone.findAllEntitiesByFieldAndValue = foundEntities([spawnzone]);

    zone.touch(player);

    assert.ok(player.origin.equalsTo(100, 200, 300));
    assert.equal(spawnCalls.length, 1);
    assert.equal(spawnCalls[0].classname, TeleportEffectEntity.classname);
    assert.ok((spawnCalls[0].initialData.origin as Vector).equalsTo(100, 200, 300));
  });

  void test('closes the shop by toggling linked entities and teleporting only recent players', () => {
    const spawnCalls: SpawnCall[] = [];
    let lightOffCalls = 0;
    let shutterShowCalls = 0;
    const playerOne = createPlayerStub(1);
    const playerTwo = createPlayerStub(2);
    const light = new LightEntity(null, createMockGameAPI()).initializeEntity();
    const shutter = new BuyZoneShuttersEntity(null, createMockGameAPI()).initializeEntity();
    const spawnzone = new PlayersSpawnZoneEntity(null, createMockGameAPI()).initializeEntity();
    const zone = new BuyZoneEntity(null, createMockGameAPI({
      time: 10.05,
      engine: {
        maxplayers: 2,
        GetEdictById(edictNum: number) {
          if (edictNum === 1) {
            return { entity: playerOne };
          }

          if (edictNum === 2) {
            return { entity: playerTwo };
          }

          return { entity: null };
        },
        SpawnEntity(classname: string, initialData: Record<string, unknown>) {
          spawnCalls.push({ classname, initialData });
          return null;
        },
      },
    })).initializeEntity();

    light.off = function off() {
      lightOffCalls += 1;
    };
    shutter.show = function show() {
      shutterShowCalls += 1;
    };
    spawnzone.spawnpoints = [new Vector(10, 20, 30), new Vector(40, 50, 60)];

    zone.target = 'buyzone_links';
    zone.isOpen = true;
    zone._playerInsideTime[1] = 10.0;
    zone._playerInsideTime[2] = 5.0;
    zone.findAllEntitiesByFieldAndValue = foundEntities([light, shutter, spawnzone]);

    zone.closeShop();

    assert.equal(zone.isOpen, false);
    assert.equal(lightOffCalls, 1);
    assert.equal(shutterShowCalls, 1);
    assert.ok(playerOne.origin.equalsTo(10, 20, 30));
    assert.ok(playerTwo.origin.equalsTo(0, 0, 0));
    assert.equal(spawnCalls.length, 1);
    assert.equal(spawnCalls[0].classname, TeleportEffectEntity.classname);
  });

  void test('does not teleport players without a recorded buyzone touch when the shop closes', () => {
    const spawnCalls: SpawnCall[] = [];
    const playerOne = createPlayerStub(1);
    const playerTwo = createPlayerStub(2);
    const spawnzone = new PlayersSpawnZoneEntity(null, createMockGameAPI()).initializeEntity();
    const zone = new BuyZoneEntity(null, createMockGameAPI({
      time: 10.05,
      engine: {
        maxplayers: 2,
        GetEdictById(edictNum: number) {
          if (edictNum === 1) {
            return { entity: playerOne };
          }

          if (edictNum === 2) {
            return { entity: playerTwo };
          }

          return { entity: null };
        },
        SpawnEntity(classname: string, initialData: Record<string, unknown>) {
          spawnCalls.push({ classname, initialData });
          return null;
        },
      },
    })).initializeEntity();

    spawnzone.spawnpoints = [new Vector(10, 20, 30), new Vector(40, 50, 60)];

    zone.target = 'buyzone_links';
    zone._playerInsideTime[1] = 10.0;
    zone.findAllEntitiesByFieldAndValue = foundEntities([spawnzone]);

    zone.closeShop();

    assert.ok(playerOne.origin.equalsTo(10, 20, 30));
    assert.ok(playerTwo.origin.equalsTo(0, 0, 0));
    assert.equal(spawnCalls.length, 1);
    assert.equal(spawnCalls[0].classname, TeleportEffectEntity.classname);
  });
});

void describe('Spawnzone sampling', () => {
  void test('samples monster spawnpoints into the game manager and removes the zone', () => {
    let removed = false;
    const gameAPI = createMockGameAPI({
      manager: {
        phase: phases.waiting,
        phase_ending_time: 0,
        spawnpoints: [],
      },
    });
    const zone = new MonstersSpawnZoneEntity(null, gameAPI).initializeEntity();

    zone.model = '*1';
    zone.mins.setTo(0, 0, 0);
    zone.maxs.setTo(120, 120, 0);
    zone.setModel = function setModel() {
    };
    zone.remove = function remove() {
      removed = true;
    };

    zone.spawn();

    assert.equal(gameAPI.manager.spawnpoints.length, 4);
    assert.ok(gameAPI.manager.spawnpoints[0].equalsTo(40, 40, 24));
    assert.ok(gameAPI.manager.spawnpoints[3].equalsTo(120, 120, 24));
    assert.equal(removed, true);
  });

  void test('samples player spawnpoints and clears the visible model afterward', () => {
    let unsetModelCalls = 0;
    const zone = new PlayersSpawnZoneEntity(null, createMockGameAPI({
      engine: {
        maxplayers: 2,
      },
    })).initializeEntity();

    zone.model = '*1';
    zone.mins.setTo(0, 0, 0);
    zone.maxs.setTo(120, 120, 0);
    zone.setModel = function setModel() {
    };
    zone.unsetModel = function unsetModel() {
      unsetModelCalls += 1;
    };

    assert.deepEqual(serializableFieldsOf(PlayersSpawnZoneEntity), ['spawnpoints']);

    zone.spawn();

    assert.equal(zone.spawnpoints.length, 4);
    assert.ok(zone.spawnpoints[0].equalsTo(40, 40, 24));
    assert.ok(zone.spawnpoints[3].equalsTo(120, 120, 24));
    assert.equal(unsetModelCalls, 1);
  });
});
