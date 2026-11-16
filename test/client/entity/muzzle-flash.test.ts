import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { ClientEdict } from '../../../../../engine/client/ClientEntities.ts';
import { BaseModel } from '../../../../../engine/common/model/BaseModel.ts';
import Vector from '../../../../../shared/Vector.ts';
import { createInertEngineApi } from '../../../../../../test/support/entityMocks.ts';
import { asClientEngineAPI } from '../../../../id1/test/client/fixtures.ts';

await import('../../../../id1/GameAPI.ts');

const { HeldWeaponEntity } = await import('../../../entity/HeldWeapons.ts');
const { MuzzleFlashClientEdictHandler, muzzleFlashFamilies } = await import('../../../client/entity/MuzzleFlash.ts');
const { HellwavePlayerClientEdictHandler } = await import('../../../client/entity/Player.ts');
const { clientEdictHandlerClasses } = await import('../../../client/entity/ClientEdictHandlers.ts');

interface FlashStub {
  readonly classname: string;
  readonly persistent: boolean | undefined;
  readonly origin: Vector;
  readonly angles: Vector;
  model: unknown;
  attachedTo: { parent: unknown; tag: string | null } | null;
  spawnParameters: unknown;
}

/**
 * @param state The clock and what the sequence query answers.
 * @returns A client engine that hands out stand-ins for the flash entities, and what it was asked to do.
 */
function createEngine(state: { time?: number; duration?: number } = {}) {
  const flashes: FlashStub[] = [];
  const models: string[] = [];
  const clock = { time: state.time ?? 100, frametime: 0.016 };
  const engine = createInertEngineApi({
    CL: clock,
    ModForName: (name: string) => {
      models.push(name);
      return new BaseModel(name);
    },
    GetSequenceDuration: () => state.duration ?? 0.2,
    SpawnClientEntity: (classname: string, options: { persistent?: boolean } = {}) => {
      const stub: FlashStub = {
        classname,
        persistent: options.persistent,
        origin: new Vector(Infinity, Infinity, Infinity),
        angles: new Vector(Infinity, Infinity, Infinity),
        model: null,
        attachedTo: null,
        spawnParameters: undefined,
      };
      flashes.push(stub);

      return Object.assign(stub, {
        setAttachment(parent: unknown, tag: string | null) {
          stub.attachedTo = { parent, tag };
        },
        spawn(parameters: unknown) {
          stub.spawnParameters = parameters;
        },
      });
    },
    GetEntities: function* (filter: ((entity: ClientEdict) => boolean) | null = null) {
      for (const entity of entities) {
        if (!filter || filter(entity)) {
          yield entity;
        }
      }
    },
    GetMuzzleFlashOrigin: () => false,
    AllocDlight: () => ({ origin: new Vector(), color: new Vector(), radius: 0, die: 0, minlight: 0 }),
    SetEntityJointAngles: () => false,
    SetEntityPitchesBody: () => {},
  });
  const entities: ClientEdict[] = [];

  return { engine: asClientEngineAPI(engine), flashes, models, clock, entities };
}

/**
 * @param modelName The model of the entity, `null` for none.
 * @param parent What it is attached to.
 * @returns A client entity.
 */
function createEntity(modelName: string | null, parent: ClientEdict | null = null): ClientEdict {
  const entity = new ClientEdict(-1);

  entity.model = modelName === null ? null : new BaseModel(modelName);
  entity.angles.clear();
  entity.origin.clear();

  if (parent !== null) {
    entity.setAttachment(parent, 'tag_weapon');
  }

  return entity;
}

void describe('MuzzleFlashClientEdictHandler.spawnOn', () => {
  void test('puts a one-shot flash on the weapon\'s tag_flash: attached, rolled, living as long as its animation', () => {
    const { engine, flashes, models } = createEngine({ duration: 0.16 });
    const gun = createEntity('progs/p_nail.iqm');

    assert.equal(MuzzleFlashClientEdictHandler.spawnOn(engine, gun), true);

    assert.equal(flashes.length, 1);
    const flash = flashes[0]!;
    assert.equal(flash.classname, 'hellwave_muzzleflash');
    assert.equal(flash.persistent, false, 'the server does not need it saved');
    assert.match(models[0]!, /^gfx\/muzzle_flash\/star_smg_[123]\.gif$/);
    assert.equal(flash.attachedTo?.parent, gun);
    assert.equal(flash.attachedTo?.tag, 'tag_flash');
    assert.deepEqual([flash.origin[0], flash.origin[1], flash.origin[2]], [0, 0, 0], 'on the tag itself');
    assert.equal(flash.angles[0], 0);
    assert.equal(flash.angles[1], 0);
    assert.ok(flash.angles[2] >= 0 && flash.angles[2] < 360, 'a roll');
    assert.deepEqual(flash.spawnParameters, { duration: 0.16 });
  });

  void test('a model without a flash (the axe, one that is not listed, no model at all) gets none', () => {
    const { engine, flashes } = createEngine();

    assert.equal(MuzzleFlashClientEdictHandler.spawnOn(engine, createEntity('progs/p_axe.iqm')), false);
    assert.equal(MuzzleFlashClientEdictHandler.spawnOn(engine, createEntity('progs/mystery.iqm')), false);
    assert.equal(MuzzleFlashClientEdictHandler.spawnOn(engine, createEntity(null)), false);
    assert.equal(flashes.length, 0);
  });

  void test('the variations and the roll differ from shot to shot, and all three variations are used', () => {
    const { engine, models, flashes } = createEngine();
    const gun = createEntity('progs/p_shot1.iqm');

    for (let shot = 0; shot < 120; shot++) {
      MuzzleFlashClientEdictHandler.spawnOn(engine, gun);
    }

    assert.deepEqual([...new Set(models)].sort(), ['gfx/muzzle_flash/star_shotgun_1.gif', 'gfx/muzzle_flash/star_shotgun_2.gif', 'gfx/muzzle_flash/star_shotgun_3.gif']);
    assert.ok(new Set(flashes.map((flash) => flash.angles[2])).size > 50, 'every flash is rolled by itself');
  });

  void test('every weapon that a Hellwave player can hold has a flash, except the axe, and the server precaches every GIF it can use', () => {
    const guns = HeldWeaponEntity.models.filter((model) => model !== 'progs/p_axe.iqm');
    assert.ok(guns.length > 0);
    for (const gun of guns) {
      assert.ok(muzzleFlashFamilies[gun], `${gun} has no flash`);
    }
    assert.equal(muzzleFlashFamilies['progs/p_axe.iqm'], undefined);

    const precached: string[] = [];
    MuzzleFlashClientEdictHandler._precache(createInertEngineApi({ PrecacheModel: (name: string) => precached.push(name) }));

    for (const family of Object.values(muzzleFlashFamilies)) {
      for (const variant of [1, 2, 3]) {
        assert.ok(precached.includes(`gfx/muzzle_flash/${family}_${variant}.gif`), `${family}_${variant}`);
      }
    }
  });
});

/** A flash handler that counts removals instead of freeing a slot. */
class CountingFlash extends MuzzleFlashClientEdictHandler {
  removed = 0;

  protected override remove(): void {
    this.removed++;
  }
}

void describe('MuzzleFlashClientEdictHandler think', () => {
  void test('removes the flash when its animation is over, and not before', () => {
    const { engine, clock } = createEngine({ time: 50 });
    const handler = new CountingFlash(new ClientEdict(-1), engine);

    handler.spawn({ duration: 0.2 });
    clock.time = 50.19;
    handler.think();
    assert.equal(handler.removed, 0);

    clock.time = 50.2;
    handler.think();
    assert.equal(handler.removed, 1);
  });

  void test('a flash that was given no duration still goes, after a quarter of a second', () => {
    const { engine, clock } = createEngine({ time: 10 });
    const handler = new CountingFlash(new ClientEdict(-1), engine);

    handler.spawn();
    clock.time = 10.24;
    handler.think();
    clock.time = 10.26;
    handler.think();

    assert.equal(handler.removed, 1);
  });
});

void describe('HellwavePlayerClientEdictHandler', () => {
  /**
   * @returns A player with a gun and an axe attached to it, and a handler for it.
   */
  function createPlayerWithGun() {
    const setup = createEngine();
    const player = new ClientEdict(1);
    player.effects = 0;
    const axe = createEntity('progs/p_axe.iqm', player);
    const gun = createEntity('progs/p_rock2.iqm', player);
    setup.entities.push(player, axe, gun);

    return { ...setup, player, gun, axe, handler: new HellwavePlayerClientEdictHandler(player, setup.engine) };
  }

  /**
   * What the engine does when it reads an update that sets the muzzle flash bit: counts the shot.
   * @param player The player.
   * @param clock The client clock.
   */
  function shoot(player: ClientEdict, clock: { time: number }): void {
    player.muzzleFlashCount++;
    player.muzzleFlashTime = clock.time;
  }

  void test('a shot makes one flash on the gun in the hand, not on the axe', () => {
    const { handler, player, gun, flashes, clock } = createPlayerWithGun();
    handler.emit(); // the first frame the handler sees the player

    clock.time += 0.016;
    shoot(player, clock);
    handler.emit();

    assert.equal(flashes.length, 1);
    assert.equal(flashes[0]!.attachedTo?.parent, gun);
  });

  void test('a shot whose bit was set and cleared again before the frame is not lost: the engine counted it', () => {
    const { handler, player, flashes, clock } = createPlayerWithGun();
    handler.emit();

    clock.time += 0.1;
    shoot(player, clock);
    player.effects = 0; // two datagrams in one frame: the bit is already gone when the handler looks
    handler.emit();

    assert.equal(flashes.length, 1);
  });

  void test('the same shot is not flashed twice over several frames', () => {
    const { handler, player, flashes, clock } = createPlayerWithGun();
    handler.emit();
    shoot(player, clock);

    for (let frame = 0; frame < 5; frame++) {
      clock.time += 0.016;
      handler.emit();
    }

    assert.equal(flashes.length, 1);
  });

  void test('every shot gets its flash', () => {
    const { handler, player, flashes, clock } = createPlayerWithGun();
    handler.emit();

    for (let shot = 0; shot < 3; shot++) {
      clock.time += 0.2;
      shoot(player, clock);
      handler.emit();
    }

    assert.equal(flashes.length, 3);
  });

  void test('shots read in one frame make one flash, and shots closer together than the least time between flashes do not pile them up', () => {
    const { handler, player, flashes, clock } = createPlayerWithGun();
    handler.emit();

    clock.time += 0.1;
    shoot(player, clock);
    shoot(player, clock);
    handler.emit();
    clock.time += 0.01;
    shoot(player, clock);
    handler.emit();

    assert.equal(flashes.length, 1);
  });

  void test('a shot read at the start of a very slow frame still gets its flash', () => {
    const { handler, player, flashes, clock } = createPlayerWithGun();
    handler.emit();

    shoot(player, clock);
    clock.frametime = 0.4;
    clock.time += 0.4;
    handler.emit();

    assert.equal(flashes.length, 1);
  });

  void test('a shot that was read long ago, while the player was out of view, is not flashed when the player comes back', () => {
    const { handler, player, flashes, clock } = createPlayerWithGun();
    handler.emit();

    shoot(player, clock);
    clock.time += 3;
    handler.emit();

    assert.equal(flashes.length, 0);
  });

  void test('a player the handler meets with shots already counted does not flash for them', () => {
    const { handler, player, flashes, clock } = createPlayerWithGun();
    player.muzzleFlashCount = 40;
    player.muzzleFlashTime = clock.time;

    handler.emit();

    assert.equal(flashes.length, 0);
  });

  void test('a player with no weapon in the hand or only a weapon without a flash makes no sprite, and nothing breaks', () => {
    const { handler, player, gun, flashes, entities, clock } = createPlayerWithGun();
    entities.splice(entities.indexOf(gun), 1);
    handler.emit();
    shoot(player, clock);

    handler.emit();

    assert.equal(flashes.length, 0);
  });

  void test('a weapon that is attached to somebody else does not get the flash', () => {
    const { handler, player, flashes, entities, gun, clock } = createPlayerWithGun();
    const other = new ClientEdict(2);
    entities.splice(entities.indexOf(gun), 1);
    entities.push(createEntity('progs/p_nail.iqm', other));
    handler.emit();
    shoot(player, clock);

    handler.emit();

    assert.equal(flashes.length, 0);
  });

  void test('is the handler of the class "player" of this game, in place of id1\'s, next to the flash\'s own', () => {
    const classnames = clientEdictHandlerClasses.map((handlerClass) => handlerClass.classname);

    assert.equal(classnames.filter((name) => name === 'player').length, 1);
    assert.ok(clientEdictHandlerClasses.includes(HellwavePlayerClientEdictHandler));
    assert.ok(classnames.includes('hellwave_muzzleflash'));
    assert.equal(new Set(classnames).size, classnames.length, 'no classname twice');
  });
});

