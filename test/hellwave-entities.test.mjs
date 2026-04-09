import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import Vector from '../../../shared/Vector.ts';

await import('../../id1/GameAPI.ts');

const { hull, moveType, solid } = await import('../Defs.ts');
const { ServerGameAPI } = await import('../GameAPI.ts');
const { HellwaveDogMonsterEntity } = await import('../entity/Monsters.ts');
const { WallEntity } = await import('../entity/Props.ts');
const hellwaveWeaponsModule = await import('../entity/Weapons.ts');
const id1WeaponsModule = await import('../../id1/entity/Weapons.ts');

const { HellwaveSuperspike } = hellwaveWeaponsModule;
const { Superspike: Id1Superspike } = id1WeaponsModule;

/**
 * Create the minimal game API surface required by the Hellwave wrapper entity tests.
 * @param {object} overrides Optional overrides.
 * @returns {object} Mock game API.
 */
function createMockGameAPI(overrides = {}) {
  const engine = {
    IsLoading() {
      return false;
    },
    PrecacheModel() {
    },
    DispatchTempEntityEvent() {
    },
    DeterminePointContents() {
      return 0;
    },
    ...overrides.engine,
  };

  return {
    time: 0,
    engine,
    ...overrides,
  };
}

void describe('Hellwave wrapper registry', () => {
  void test('registers Hellwave overrides for dog, wall, and superspike entities', () => {
    assert.equal(ServerGameAPI._entityRegistry.get(HellwaveDogMonsterEntity.classname), HellwaveDogMonsterEntity);
    assert.equal(ServerGameAPI._entityRegistry.get(WallEntity.classname), WallEntity);
    assert.equal(ServerGameAPI._entityRegistry.get(HellwaveSuperspike.classname), HellwaveSuperspike);
  });
});

void describe('HellwaveDogMonsterEntity', () => {
  void test('keeps the dog classname and copies the thin hull size vectors', () => {
    const [mins, maxs] = HellwaveDogMonsterEntity._size;

    assert.equal(HellwaveDogMonsterEntity.classname, 'monster_dog');
    assert.deepEqual([mins[0], mins[1], mins[2]], [hull[1][0][0], hull[1][0][1], hull[1][0][2]]);
    assert.deepEqual([maxs[0], maxs[1], maxs[2]], [hull[1][1][0], hull[1][1][1], hull[1][1][2]]);
    assert.notEqual(mins, hull[1][0]);
    assert.notEqual(maxs, hull[1][1]);
  });
});

void describe('WallEntity', () => {
  void test('serializes the shown model state and toggles visibility behavior', () => {
    const wall = new WallEntity(null, createMockGameAPI()).initializeEntity();

    wall.setModel = function setModel(model) {
      this.model = model;
    };

    wall.unsetModel = function unsetModel() {
      this.model = null;
    };

    wall.model = '*1';

    assert.deepEqual(WallEntity.serializableFields, ['_shownModel']);

    wall.spawn();
    assert.equal(wall._shownModel, '*1');
    assert.equal(wall.model, '*1');
    assert.equal(wall.solid, solid.SOLID_BSP);
    assert.equal(wall.movetype, moveType.MOVETYPE_PUSH);

    wall.hide();
    assert.equal(wall.model, null);
    assert.equal(wall.solid, solid.SOLID_NOT);
    assert.equal(wall.movetype, moveType.MOVETYPE_NONE);

    wall.show();
    assert.equal(wall.model, '*1');
    assert.equal(wall.solid, solid.SOLID_BSP);
    assert.equal(wall.movetype, moveType.MOVETYPE_PUSH);
  });
});

void describe('HellwaveSuperspike', () => {
  void test('serializes ricochet runtime state on the subclass only', () => {
    assert.deepEqual(HellwaveSuperspike.serializableFields, ['_direction', '_richochetsLeft']);
  });

  void test('captures a normalized direction after spawn', () => {
    const spike = new HellwaveSuperspike(null, createMockGameAPI()).initializeEntity();

    spike.owner = {
      movedir: new Vector(0, 3, 4),
      origin: new Vector(1, 2, 3),
    };
    spike.setOrigin = function setOrigin(origin) {
      this.origin.set(origin);
    };
    spike.setSize = function setSize() {
    };
    spike.setModel = function setModel(model) {
      this.model = model;
    };
    spike._scheduleThink = function _scheduleThink() {
    };

    spike.spawn();

    assert.ok(Math.abs(spike._direction[0] - 0.0) < 1e-6);
    assert.ok(Math.abs(spike._direction[1] - 0.6) < 1e-6);
    assert.ok(Math.abs(spike._direction[2] - 0.8) < 1e-6);
    assert.ok(spike.velocity.equalsTo(0, 3000, 4000));
  });

  void test('reflects on shallow static hits and skips the base impact behavior', () => {
    const spike = new HellwaveSuperspike(null, createMockGameAPI()).initializeEntity();
    const scheduled = [];
    const sounds = [];
    const originalHandleImpact = Id1Superspike.prototype._handleImpact;
    let baseCalls = 0;

    try {
      Id1Superspike.prototype._handleImpact = function _handleImpact() {
        baseCalls += 1;
      };

      spike.speed = 1000;
      spike.origin.setTo(10, 20, 30);
      spike.velocity.setTo(1000, 100, 0);
      spike._direction.setTo(1, 0.1, 0).normalize();
      spike._richochetsLeft = 3;
      spike._scheduleThink = function _scheduleThink(nextThink, callback) {
        scheduled.push({ nextThink, callback });
      };
      spike.startSound = function startSound(_soundChannel, soundName) {
        sounds.push(soundName);
      };
      spike.traceline = function traceline() {
        return {
          solid: true,
          plane: { normal: new Vector(0, 1, 0) },
        };
      };

      spike._handleImpact({
        isActor() {
          return false;
        },
      });

      assert.equal(baseCalls, 0);
      assert.equal(spike._richochetsLeft, 2);
      assert.equal(scheduled.length, 1);
      assert.equal(sounds.length, 1);
      assert.ok(spike.velocity[1] < 0);
    } finally {
      Id1Superspike.prototype._handleImpact = originalHandleImpact;
    }
  });

  void test('falls back to the base impact behavior when ricochet rules do not apply', () => {
    const spike = new HellwaveSuperspike(null, createMockGameAPI()).initializeEntity();
    const originalHandleImpact = Id1Superspike.prototype._handleImpact;
    let baseCalls = 0;

    try {
      Id1Superspike.prototype._handleImpact = function _handleImpact(touchedByEntity) {
        baseCalls += 1;
        assert.equal(typeof touchedByEntity.isActor, 'function');
      };

      spike._scheduleThink = function _scheduleThink() {
      };

      spike._handleImpact({
        isActor() {
          return true;
        },
      });

      assert.equal(baseCalls, 1);
    } finally {
      Id1Superspike.prototype._handleImpact = originalHandleImpact;
    }
  });
});
