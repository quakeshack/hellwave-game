import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import Vector from '../../../shared/Vector.ts';

import type { TestContext } from 'node:test';

import type { ServerEdict } from '../../../engine/server/Edict.ts';
import { createGameTrace, createInertEdict, createInertGameApi, createMutableEngineApi, createEntityStub } from '../../../../test/support/entityMocks.ts';
import { serializableFieldsOf } from '../../../../test/support/serialization.ts';

await import('../../id1/GameAPI.ts');

const { default: BaseEntity } = await import('../../id1/entity/BaseEntity.ts');
const { hull, moveType, solid } = await import('../Defs.ts');
const { ServerGameAPI } = await import('../GameAPI.ts');
const { HellwaveDogMonsterEntity } = await import('../entity/Monsters.ts');
const { WallEntity } = await import('../entity/Props.ts');
const hellwaveWeaponsModule = await import('../entity/Weapons.ts');
const id1WeaponsModule = await import('../../id1/entity/Weapons.ts');

const { HellwaveSuperspike } = hellwaveWeaponsModule;
const { Superspike: Id1Superspike } = id1WeaponsModule;

/** BaseEntity is abstract; this is the entity with nothing added to it. */
class PlainEntity extends BaseEntity {
  static classname = 'plain_entity';
}

/** A superspike that lets a test read and set the ricochet state the entity keeps to itself, and run its impact. */
class TestSuperspike extends HellwaveSuperspike {
  get direction() {
    return this._direction;
  }

  get ricochetsLeft(): number {
    return this._richochetsLeft;
  }

  set ricochetsLeft(count: number) {
    this._richochetsLeft = count;
  }

  impact(touchedByEntity: InstanceType<typeof BaseEntity>): void {
    this._handleImpact(touchedByEntity);
  }
}

/**
 * Replace the impact behavior of id1's superspike, which Hellwave's falls back to, for the length of a test.
 * @param t The test context, which puts the original back when the test ends.
 * @param implementation What the base impact does instead.
 */
function mockBaseImpact(t: TestContext, implementation: (touchedByEntity: InstanceType<typeof BaseEntity>) => void): void {
  // The impact is a protected method, which `keyof` leaves out; it is a plain method of the prototype.
  t.mock.method(Id1Superspike.prototype as unknown as { _handleImpact(touchedByEntity: InstanceType<typeof BaseEntity>): void }, '_handleImpact', implementation);
}

/**
 * An edict that is not free, for an entity that is checked for validity.
 * @returns The edict.
 */
function createFreeAwareEdict(): ServerEdict {
  const edict = createInertEdict();
  edict.isFree = () => false;
  return edict;
}

/**
 * Create the minimal game API surface required by the Hellwave wrapper entity tests.
 * @returns Mock game API.
 */
function createMockGameAPI(): ReturnType<typeof createInertGameApi> {
  const engine = createMutableEngineApi({
    PrecacheModel() {
    },
    DispatchTempEntityEvent() {
    },
    DeterminePointContents() {
      return 0;
    },
  });

  return createInertGameApi({}, engine);
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

    wall.setModel = function setModel(this: typeof wall, model: string | null) {
      this.model = model;
    };

    wall.unsetModel = function unsetModel(this: typeof wall) {
      this.model = null;
    };

    wall.model = '*1';

    assert.deepEqual(serializableFieldsOf(WallEntity), ['_shownModel']);

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
    assert.deepEqual(serializableFieldsOf(HellwaveSuperspike), ['_direction', '_richochetsLeft']);
  });

  void test('captures a normalized direction after spawn', () => {
    const gameAPI = createMockGameAPI();
    const spike = new TestSuperspike(null, gameAPI).initializeEntity();

    const owner = new PlainEntity(createFreeAwareEdict(), gameAPI).initializeEntity();
    owner.movedir = new Vector(0, 3, 4);
    owner.origin = new Vector(1, 2, 3);
    spike.owner = owner;
    spike.setOrigin = function setOrigin(this: typeof spike, origin: Vector) {
      this.origin.set(origin);
    };
    spike.setSize = function setSize() {
    };
    spike.setModel = function setModel(this: typeof spike, model: string | null) {
      this.model = model;
    };
    spike._scheduleThink = function _scheduleThink() {
    };

    spike.spawn();

    assert.ok(Math.abs(spike.direction[0] - 0.0) < 1e-6);
    assert.ok(Math.abs(spike.direction[1] - 0.6) < 1e-6);
    assert.ok(Math.abs(spike.direction[2] - 0.8) < 1e-6);
    assert.ok(spike.velocity.equalsTo(0, 3000, 4000));
  });

  void test('reflects on shallow static hits and skips the base impact behavior', (t) => {
    const spike = new TestSuperspike(null, createMockGameAPI()).initializeEntity();
    const scheduled: Array<{ nextThink: number }> = [];
    const sounds: string[] = [];
    let baseCalls = 0;

    mockBaseImpact(t, () => {
      baseCalls += 1;
    });

    spike.speed = 1000;
    spike.origin.setTo(10, 20, 30);
    spike.velocity.setTo(1000, 100, 0);
    spike.direction.setTo(1, 0.1, 0).normalize();
    spike.ricochetsLeft = 3;
    spike._scheduleThink = function _scheduleThink(nextThink: number) {
      scheduled.push({ nextThink });
    };
    spike.startSound = function startSound(_soundChannel: number, soundName: string) {
      sounds.push(soundName);
    };
    spike.traceline = function traceline() {
      return createGameTrace({
        solid: { all: true, start: true },
        plane: { normal: new Vector(0, 1, 0), distance: 0 },
      });
    };

    spike.impact(createEntityStub({
      isActor() {
        return false;
      },
    }));

    assert.equal(baseCalls, 0);
    assert.equal(spike.ricochetsLeft, 2);
    assert.equal(scheduled.length, 1);
    assert.equal(sounds.length, 1);
    assert.ok(spike.velocity[1] < 0);
  });

  void test('falls back to the base impact behavior when ricochet rules do not apply', (t) => {
    const spike = new TestSuperspike(null, createMockGameAPI()).initializeEntity();
    let baseCalls = 0;

    mockBaseImpact(t, (touchedByEntity) => {
      baseCalls += 1;
      assert.equal(typeof touchedByEntity.isActor, 'function');
    });

    spike._scheduleThink = function _scheduleThink() {
    };

    spike.impact(createEntityStub({
      isActor() {
        return true;
      },
    }));

    assert.equal(baseCalls, 1);
  });
});
