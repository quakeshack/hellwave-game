import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { WeaponConfigKey } from '../../id1/entity/Weapons.ts';
import type { HeldWeaponEntity as HeldWeapon } from '../entity/HeldWeapons.ts';
import type { dead as DeadFlag } from '../Defs.ts';

await import('../../id1/GameAPI.ts');

const { dead, effect, items } = await import('../Defs.ts');
const { weaponConfig } = await import('../../id1/entity/Weapons.ts');
const { HeldWeaponEntity } = await import('../entity/HeldWeapons.ts');
const hellwavePlayerModule = await import('../entity/Player.ts');

const HellwavePlayer = hellwavePlayerModule.default;

/** A player that lets a test run the step that keeps the carried weapons in line with the weapon in use. */
class TestPlayer extends HellwavePlayer {
  syncHeldWeapons(): void {
    this._syncHeldWeapons();
  }

  get gun(): HeldWeapon | null {
    return this._heldGun;
  }

  get axe(): HeldWeapon | null {
    return this._heldAxe;
  }
}

/**
 * @param prototype The class the stand-in has to be an instance of.
 * @param members The members it carries. They are defined, not assigned, because the entity base class has accessors for some (`edict`, `engine`).
 * @returns The stand-in.
 */
function standIn<T extends object>(prototype: T, members: Record<string, unknown>): T {
  const object = Object.create(prototype) as T;

  for (const [name, value] of Object.entries(members)) {
    Object.defineProperty(object, name, { value, writable: true, configurable: true, enumerable: true });
  }

  return object;
}

interface HeldRecord {
  readonly held: HeldWeapon;
  readonly attachments: Array<[unknown, string | null]>;
  removed: boolean;
}

/**
 * @returns A player-shaped stub whose engine hands out stand-ins for held weapons, and what happened to them.
 */
function createCarrier(state: { weapon?: number; lastGun?: number; spectating?: boolean; deadflag?: DeadFlag; items?: number } = {}) {
  const records: HeldRecord[] = [];
  const holderEdict = { isFree: () => false };
  const engine = {
    SpawnEntity(): { entity: HeldWeapon } {
      const attachments: HeldRecord['attachments'] = [];
      const record: HeldRecord = {
        // A real held weapon needs an edict of an engine; the code under test reads and writes the members below.
        held: standIn(HeldWeaponEntity.prototype, {
          model: null as string | null,
          effects: 0,
          edict: { isFree: () => false, setAttachment: (parent: unknown, tag: string | null) => attachments.push([parent, tag]) },
          setModel(model: string | null) {
            this.model = model;
          },
          remove() {
            record.removed = true;
          },
        }),
        attachments,
        removed: false,
      };
      records.push(record);

      return { entity: record.held };
    },
  };

  const player = standIn(TestPlayer.prototype, {
    edict: holderEdict,
    engine,
    weapon: state.weapon ?? items.IT_AXE,
    _lastGun: state.lastGun ?? items.IT_SHOTGUN,
    spectating: state.spectating ?? false,
    deadflag: state.deadflag ?? dead.DEAD_NO,
    items: state.items ?? items.IT_AXE | items.IT_SHOTGUN,
    _heldGun: null,
    _heldAxe: null,
  });

  return { player, records, holderEdict };
}

/**
 *
 */
/**
 * @param held A held weapon.
 * @returns Whether it is drawn.
 */
function isDrawn(held: HeldWeapon | null): boolean {
  assert.ok(held);
  return (held.effects & effect.EF_NODRAW) === 0;
}

void describe('held weapons', () => {
  void test('the weapon table has a model for every weapon, and it is the table id1 reads', () => {
    const weapons: WeaponConfigKey[] = [items.IT_AXE, items.IT_SHOTGUN, items.IT_SUPER_SHOTGUN, items.IT_NAILGUN, items.IT_SUPER_NAILGUN, items.IT_GRENADE_LAUNCHER, items.IT_ROCKET_LAUNCHER, items.IT_LIGHTNING];

    for (const weapon of weapons) {
      const model = weaponConfig.get(weapon)?.playerModel;
      assert.ok(model !== undefined && model.endsWith('.iqm'), `weapon ${weapon}`);
      assert.ok(HeldWeaponEntity.models.includes(model), `${model} is precached`);
    }
  });

  void test('with the axe out the gun hangs on the back and the axe is in the hand', () => {
    const { player, records, holderEdict } = createCarrier({ weapon: items.IT_AXE, lastGun: items.IT_SHOTGUN });

    player.syncHeldWeapons();

    assert.equal(records.length, 2);
    assert.equal(player.gun?.model, weaponConfig.get(items.IT_SHOTGUN)?.playerModel);
    assert.equal(player.axe?.model, weaponConfig.get(items.IT_AXE)?.playerModel);
    assert.deepEqual(records[0]!.attachments, [[holderEdict, 'tag_weapon']]);
    assert.deepEqual(records[1]!.attachments, [[holderEdict, 'tag_axe']]);
    assert.ok(isDrawn(player.gun));
    assert.ok(isDrawn(player.axe));
  });

  void test('switching to a gun hides the axe and keeps the same entities', () => {
    const { player, records } = createCarrier({ weapon: items.IT_AXE });
    player.syncHeldWeapons();

    Object.assign(player, { weapon: items.IT_NAILGUN, _lastGun: items.IT_NAILGUN });
    player.syncHeldWeapons();

    assert.equal(records.length, 2); // nothing was spawned again
    assert.equal(player.gun?.model, weaponConfig.get(items.IT_NAILGUN)?.playerModel);
    assert.ok(isDrawn(player.gun));
    assert.ok(!isDrawn(player.axe));
    assert.ok(records.every((record) => !record.removed));
  });

  void test('going back to the axe shows it again without spawning, and the gun stays on the back', () => {
    const { player, records } = createCarrier({ weapon: items.IT_SHOTGUN });
    player.syncHeldWeapons();
    assert.ok(!isDrawn(player.axe));

    Object.assign(player, { weapon: items.IT_AXE });
    player.syncHeldWeapons();

    assert.equal(records.length, 2);
    assert.ok(isDrawn(player.axe));
    assert.ok(isDrawn(player.gun));
    assert.equal(player.gun?.model, weaponConfig.get(items.IT_SHOTGUN)?.playerModel);
  });

  void test('a player who never had a gun carries no gun, only the axe', () => {
    const { player, records } = createCarrier({ weapon: items.IT_AXE, lastGun: 0 });

    player.syncHeldWeapons();

    assert.equal(player.gun, null);
    assert.equal(records.length, 1);
    assert.equal(player.axe?.model, weaponConfig.get(items.IT_AXE)?.playerModel);
  });

  void test('running it again changes nothing', () => {
    const { player, records } = createCarrier({ weapon: items.IT_SHOTGUN });
    player.syncHeldWeapons();
    const [gun, axe] = [player.gun, player.axe];

    player.syncHeldWeapons();
    player.syncHeldWeapons();

    assert.equal(records.length, 2);
    assert.equal(player.gun, gun);
    assert.equal(player.axe, axe);
    assert.deepEqual(records.map((record) => record.attachments.length), [1, 1]);
  });

  void test('a dead, spectating or invisible player carries nothing, and the weapons go', () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ['dead', { deadflag: dead.DEAD_DYING }],
      ['spectating', { spectating: true }],
      ['invisible (the eyes model has no tags)', { items: items.IT_AXE | items.IT_SHOTGUN | items.IT_INVISIBILITY }],
    ];

    for (const [name, change] of cases) {
      const { player, records } = createCarrier({ weapon: items.IT_SHOTGUN });
      player.syncHeldWeapons();
      assert.ok(player.gun && player.axe, name);

      Object.assign(player, change);
      player.syncHeldWeapons();

      assert.equal(player.gun, null, name);
      assert.equal(player.axe, null, name);
      assert.ok(records.every((record) => record.removed), name);
    }
  });

  void test('a player who comes back carries weapons again, new ones', () => {
    const { player, records } = createCarrier({ weapon: items.IT_SHOTGUN });
    player.syncHeldWeapons();
    Object.assign(player, { deadflag: dead.DEAD_DYING });
    player.syncHeldWeapons();

    Object.assign(player, { deadflag: dead.DEAD_NO });
    player.syncHeldWeapons();

    assert.equal(records.length, 4);
    assert.ok(player.gun && player.axe);
    assert.ok(!records[2]!.removed && !records[3]!.removed);
  });
});
