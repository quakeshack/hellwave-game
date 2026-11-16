import BaseEntity from '../../id1/entity/BaseEntity.ts';
import { serializable, serializableObject } from '../../id1/helper/MiscHelpers.ts';
import { weaponConfig, type WeaponConfigKey } from '../../id1/entity/Weapons.ts';

import { items, moveType, solid } from '../Defs.ts';

/**
 * The model other players see in a player's hand for each weapon (`progs/p_*.iqm`, built by `progs/src/build-models.sh` in the
 * game's data). A model's origin and axes are the player's weapon tag; its muzzle is its own `tag_flash`.
 */
const heldWeaponModels: ReadonlyMap<WeaponConfigKey, string> = new Map<WeaponConfigKey, string>([
  [items.IT_AXE, 'progs/p_axe.iqm'],
  [items.IT_SHOTGUN, 'progs/p_shot1.iqm'],
  [items.IT_SUPER_SHOTGUN, 'progs/p_shot.iqm'],
  [items.IT_NAILGUN, 'progs/p_nail.iqm'],
  [items.IT_SUPER_NAILGUN, 'progs/p_nail2.iqm'],
  [items.IT_GRENADE_LAUNCHER, 'progs/p_rock.iqm'],
  [items.IT_ROCKET_LAUNCHER, 'progs/p_rock2.iqm'],
  [items.IT_LIGHTNING, 'progs/p_light.iqm'],
]);

/**
 * id1's weapon table has a slot for the model a player holds and leaves it empty. This game fills it, once, when the module is loaded.
 */
for (const [weapon, playerModel] of heldWeaponModels) {
  const entry = weaponConfig.get(weapon);

  if (entry !== undefined) {
    weaponConfig.set(weapon, { ...entry, playerModel });
  }
}

/** Where the gun is held on the player model: the hand, or the back while the axe is out. */
export const GUN_TAG = 'tag_weapon';

/** Where the axe is held on the player model. */
export const AXE_TAG = 'tag_axe';

/** Where the axe is carried while a gun is in the hand: a holster on the back, which the player model has as a tag of its own. */
export const AXE_HOLSTER_TAG = 'tag_axe_back';

/**
 * A weapon a player carries, drawn on a tag of the player's model. The player owns it: it is made when the player first carries
 * a weapon, changes its model when the weapon changes, moves between tags (the axe, from the hand to the back), and goes when the
 * player cannot carry it (dead, spectating, gone).
 */
@serializableObject
export class HeldWeaponEntity extends BaseEntity {
  static classname = 'hellwave_heldweapon';

  /** The tag of the holder's model it is attached to now. */
  @serializable tagName = '';

  /**
   * @returns The models that have to be precached for players to hold weapons.
   */
  static get models(): readonly string[] {
    return [...heldWeaponModels.values()];
  }

  /**
   * @param weapon A weapon of the weapon table.
   * @returns The model that is held for it, `null` for a weapon without one.
   */
  static modelOf(weapon: WeaponConfigKey | 0): string | null {
    return weapon === 0 ? null : weaponConfig.get(weapon)?.playerModel ?? null;
  }

  /**
   * Makes `slot` show what a player should be holding there, spawning, changing, moving or freeing it.
   * @param holder The player.
   * @param slot What the player holds there now, `null` for nothing.
   * @param model The weapon model, `null` when the slot should not exist.
   * @param tag The tag of the holder's model it hangs on.
   * @returns What the slot is now, to keep.
   */
  static update(holder: BaseEntity, slot: HeldWeaponEntity | null, model: string | null, tag: string): HeldWeaponEntity | null {
    if (model === null) {
      slot?.remove();
      return null;
    }

    let held = slot;

    if (held === null || held.edict === null || held.edict.isFree()) {
      held = holder.engine.SpawnEntity<HeldWeaponEntity>(HeldWeaponEntity.classname)?.entity ?? null;

      if (!(held instanceof HeldWeaponEntity)) {
        return null;
      }

      held.setModel(model, false);
    } else if (held.model !== model) {
      held.setModel(model, false);
    }

    if (held.tagName !== tag) {
      held.edict!.setAttachment(holder.edict!, tag);
      held.tagName = tag;
    }

    return held;
  }

  override spawn(): void {
    // Attached entities do not move by themselves and are not solid.
    this.movetype = moveType.MOVETYPE_NONE;
    this.solid = solid.SOLID_NOT;
  }
}
