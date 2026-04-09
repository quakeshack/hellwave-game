import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import Vector from '../../../shared/Vector.ts';

await import('../../id1/GameAPI.ts');

const { formatMoney, solid } = await import('../Defs.ts');
const { phases } = await import('../Phases.ts');
const hellwaveItemsModule = await import('../entity/Items.ts');
const hellwaveZonesModule = await import('../entity/Zones.ts');
const { LightEntity, TeleportEffectEntity } = await import('../../id1/entity/Misc.ts');
const playerModule = await import('../../id1/entity/Player.ts');

const { HellwaveBackpackEntity, HellwaveHealthItemEntity } = hellwaveItemsModule;
const { BuyZoneEntity, BuyZoneShuttersEntity, MonstersSpawnZoneEntity, PlayersSpawnZoneEntity } = hellwaveZonesModule;
const { PlayerEntity } = playerModule;

/**
 * Create the minimal game API surface required by the Hellwave items and zones tests.
 * @param {object} overrides Optional overrides.
 * @returns {object} Mock game API.
 */
function createMockGameAPI(overrides = {}) {
  const engine = {
    ConsoleWarning() {
    },
    IsLoading() {
      return false;
    },
    SpawnEntity() {
      return null;
    },
    GetEdictById() {
      return { entity: null };
    },
    maxplayers: 0,
    ...overrides.engine,
  };

  return {
    time: 0,
    debug_spawnpoints: 0,
    manager: {
      phase: phases.waiting,
      phase_ending_time: 0,
      spawnpoints: [],
    },
    engine,
    ...overrides,
  };
}

/**
 * Create a player-shaped runtime stub that satisfies instanceof PlayerEntity checks.
 * @param {number} edictNum Edict slot number.
 * @returns {PlayerEntity} Player-like test entity.
 */
function createPlayerStub(edictNum) {
  const player = Object.create(PlayerEntity.prototype);

  Object.defineProperty(player, 'edict', {
    value: { num: edictNum },
    writable: true,
    configurable: true,
  });

  player.origin = new Vector();
  player.buyzone_time = 0;
  player.setOrigin = function setOrigin(origin) {
    this.origin = origin.copy();
  };

  return player;
}

void describe('HellwaveBackpackEntity', () => {
  void test('serializes only the added money field and appends formatted money labels', () => {
    const backpack = new HellwaveBackpackEntity(null, createMockGameAPI()).initializeEntity();

    assert.deepEqual(HellwaveBackpackEntity.serializableFields, ['money']);

    backpack.money = 250;
    assert.deepEqual(backpack._collectItems(createPlayerStub(1)), [formatMoney(250)]);

    backpack.money = 0;
    assert.deepEqual(backpack._collectItems(createPlayerStub(1)), []);
  });
});

void describe('HellwaveHealthItemEntity', () => {
  void test('delays megahealth decay until the quiet phase ends', () => {
    const scheduled = [];
    let usedTargetsWith = null;
    let removed = false;
    const player = createPlayerStub(1);
    const entity = new HellwaveHealthItemEntity(null, createMockGameAPI({
      time: 10,
      manager: {
        phase: phases.quiet,
        phase_ending_time: 30,
      },
    })).initializeEntity();

    entity.spawnflags = HellwaveHealthItemEntity.H_MEGA;
    entity.model = 'maps/b_bh100.bsp';
    entity._sub = {
      useTargets(activator) {
        usedTargetsWith = activator;
      },
    };
    entity._scheduleThink = function _scheduleThink(nextThink, callback) {
      scheduled.push({ nextThink, callback });
    };
    entity.remove = function remove() {
      removed = true;
    };

    entity._afterTouch(player);

    assert.equal(entity.solid, solid.SOLID_NOT);
    assert.equal(entity._model_original, 'maps/b_bh100.bsp');
    assert.equal(entity.model, null);
    assert.equal(entity.owner, player);
    assert.equal(usedTargetsWith, player);
    assert.equal(scheduled.length, 1);
    assert.equal(scheduled[0].nextThink, 35);
    assert.equal(removed, false);
  });

  void test('uses the current game time for megahealth decay outside quiet phase', () => {
    const scheduled = [];
    const entity = new HellwaveHealthItemEntity(null, createMockGameAPI({
      time: 10,
      manager: {
        phase: phases.normal,
        phase_ending_time: 30,
      },
    })).initializeEntity();

    entity.spawnflags = HellwaveHealthItemEntity.H_MEGA;
    entity._sub = { useTargets() {} };
    entity._scheduleThink = function _scheduleThink(nextThink, callback) {
      scheduled.push({ nextThink, callback });
    };

    entity._afterTouch(createPlayerStub(1));

    assert.equal(scheduled.length, 1);
    assert.equal(scheduled[0].nextThink, 15);
  });

  void test('removes non-mega health immediately after pickup', () => {
    let removed = false;
    const entity = new HellwaveHealthItemEntity(null, createMockGameAPI()).initializeEntity();

    entity.spawnflags = HellwaveHealthItemEntity.H_NORMAL;
    entity._sub = { useTargets() {} };
    entity.remove = function remove() {
      removed = true;
    };

    entity._afterTouch(createPlayerStub(1));

    assert.equal(removed, true);
  });
});

void describe('BuyZoneEntity', () => {
  void test('records player presence during quiet phase without teleporting them', () => {
    const spawnCalls = [];
    const player = createPlayerStub(2);
    const zone = new BuyZoneEntity(null, createMockGameAPI({
      time: 12,
      manager: {
        phase: phases.quiet,
        phase_ending_time: 50,
      },
      engine: {
        SpawnEntity(classname, initialData) {
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
    const spawnCalls = [];
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
        SpawnEntity(classname, initialData) {
          spawnCalls.push({ classname, initialData });
          return null;
        },
      },
    })).initializeEntity();

    spawnzone.spawnpoints = [targetPoint];
    zone.target = 'buyzone_links';
    zone.findAllEntitiesByFieldAndValue = function findAllEntitiesByFieldAndValue() {
      return [spawnzone];
    };

    zone.touch(player);

    assert.ok(player.origin.equalsTo(100, 200, 300));
    assert.equal(spawnCalls.length, 1);
    assert.equal(spawnCalls[0].classname, TeleportEffectEntity.classname);
    assert.ok(spawnCalls[0].initialData.origin.equalsTo(100, 200, 300));
  });

  void test('closes the shop by toggling linked entities and teleporting only recent players', () => {
    const spawnCalls = [];
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
        GetEdictById(edictNum) {
          if (edictNum === 1) {
            return { entity: playerOne };
          }

          if (edictNum === 2) {
            return { entity: playerTwo };
          }

          return { entity: null };
        },
        SpawnEntity(classname, initialData) {
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
    zone.findAllEntitiesByFieldAndValue = function findAllEntitiesByFieldAndValue() {
      return [light, shutter, spawnzone];
    };

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
    const spawnCalls = [];
    const playerOne = createPlayerStub(1);
    const playerTwo = createPlayerStub(2);
    const spawnzone = new PlayersSpawnZoneEntity(null, createMockGameAPI()).initializeEntity();
    const zone = new BuyZoneEntity(null, createMockGameAPI({
      time: 10.05,
      engine: {
        maxplayers: 2,
        GetEdictById(edictNum) {
          if (edictNum === 1) {
            return { entity: playerOne };
          }

          if (edictNum === 2) {
            return { entity: playerTwo };
          }

          return { entity: null };
        },
        SpawnEntity(classname, initialData) {
          spawnCalls.push({ classname, initialData });
          return null;
        },
      },
    })).initializeEntity();

    spawnzone.spawnpoints = [new Vector(10, 20, 30), new Vector(40, 50, 60)];

    zone.target = 'buyzone_links';
    zone._playerInsideTime[1] = 10.0;
    zone.findAllEntitiesByFieldAndValue = function findAllEntitiesByFieldAndValue() {
      return [spawnzone];
    };

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

    assert.deepEqual(PlayersSpawnZoneEntity.serializableFields, ['spawnpoints']);

    zone.spawn();

    assert.equal(zone.spawnpoints.length, 4);
    assert.ok(zone.spawnpoints[0].equalsTo(40, 40, 24));
    assert.ok(zone.spawnpoints[3].equalsTo(120, 120, 24));
    assert.equal(unsetModelCalls, 1);
  });
});
