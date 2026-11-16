import type { ServerGameAPI } from '../GameAPI.ts';
import type { ServerEngineAPI } from '../../../shared/GameInterfaces.ts';

import Vector from '../../../shared/Vector.ts';

import { serializableObject, serializable } from '../../id1/helper/MiscHelpers.ts';
import { HealthItemEntity, HeavyArmorEntity, WeaponGrenadeLauncher, WeaponNailgun, WeaponRocketLauncher, WeaponSuperNailgun, WeaponSuperShotgun, WeaponThunderbolt } from '../../id1/entity/Items.ts';
import { PlayerEntity } from '../../id1/entity/Player.ts';
import { Backpack, type BackpackPickup, type WeaponConfigKey } from '../../id1/entity/Weapons.ts';
import type BaseEntity from '../../id1/entity/BaseEntity.ts';

import { channel, clientEvent, dead, flags, formatMoney, fromBuyImpulse, items, moveType, solid } from '../Defs.ts';
import { phases } from '../Phases.ts';

import { AXE_HOLSTER_TAG, AXE_TAG, GUN_TAG, HeldWeaponEntity } from './HeldWeapons.ts';
import { HellwaveBackpackEntity } from './Items.ts';

type BuyMenuItemId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

interface OwnedBackpackPickup extends BackpackPickup {
  readonly owner?: HellwaveBackpackOwner | null;
}

interface HellwaveBackpackOwner {
  equals(playerEntity: HellwavePlayer): boolean;
}

interface BuyMenuBackpack {
  readonly items?: number;
  readonly ammo_shells?: number;
  readonly ammo_nails?: number;
  readonly ammo_rockets?: number;
  readonly ammo_cells?: number;
}

interface BuyMenuEntityClass {
  readonly classname: string;
}

/**
 * The subset of player state a `BuyMenuItem.available()` predicate may inspect. Deliberately
 * narrower than `HellwavePlayer` so the client-side buy menu (`HellwaveBuyMenu`) can evaluate the
 * same predicates from synced `clientdata` alone, without a server round-trip -- see
 * `HellwaveHUD.getBuyAvailabilityContext()`.
 */
export interface BuyMenuAvailabilityContext {
  readonly armorvalue: number;
  readonly ammo_shells: number;
}

interface BuyMenuItem {
  readonly cost: number;
  readonly label: string;
  readonly available?: (context: BuyMenuAvailabilityContext) => boolean;
  readonly entityClass?: BuyMenuEntityClass;
  readonly backpack?: BuyMenuBackpack;
  readonly spawnflags?: number;
}

export const buyMenuItems: Record<BuyMenuItemId, BuyMenuItem> = {
  // heavy armor
  1: {
    cost: 100,
    label: 'Heavy Armor',
    entityClass: HeavyArmorEntity,
    available(context: BuyMenuAvailabilityContext): boolean {
      return context.armorvalue < 200;
    },
  },

  // shotgun or 20 shells
  2: {
    cost: 200,
    label: 'Shotgun / 20 shells',
    backpack: { items: items.IT_SHOTGUN | items.IT_SHELLS, ammo_shells: 20 },
    available(context: BuyMenuAvailabilityContext): boolean {
      return context.ammo_shells < HellwavePlayer._backpackLimits.ammo_shells;
    },
  },

  // super shotgun or 50 shells
  3: {
    cost: 1000,
    label: 'Super Shotgun',
    entityClass: WeaponSuperShotgun,
    backpack: { items: items.IT_SHOTGUN | items.IT_SHELLS, ammo_shells: 50 },
    available(context: BuyMenuAvailabilityContext): boolean {
      return context.ammo_shells < HellwavePlayer._backpackLimits.ammo_shells;
    },
  },

  4: { cost: 1000, label: 'Nailgun', entityClass: WeaponNailgun, backpack: { items: items.IT_NAILS, ammo_nails: 100 } },
  5: { cost: 3000, label: 'Super Nailgun', entityClass: WeaponSuperNailgun, backpack: { items: items.IT_NAILS, ammo_nails: 200 } },

  6: { cost: 5000, label: 'Grenade Launcher', entityClass: WeaponGrenadeLauncher },
  7: { cost: 5000, label: 'Rocket Launcher', entityClass: WeaponRocketLauncher },

  8: { cost: 8000, label: 'Thunderbolt', entityClass: WeaponThunderbolt, backpack: { items: items.IT_CELLS, ammo_cells: 300 } },

  9: { cost: 1000, label: 'Megahealth', entityClass: HealthItemEntity, spawnflags: HealthItemEntity.H_MEGA },
};

@serializableObject
export class HellwaveBackpack extends Backpack {
  @serializable money = 0;
}

@serializableObject
export default class HellwavePlayer extends PlayerEntity {
  @serializable money = 0;

  /**
   * -1: not allowed, 0: outside, 1: inside zone. Menu open/closed is purely client-side UI
   * state -- the server only cares whether the player is physically in a buyzone when a
   * purchase impulse actually lands.
   */
  @serializable buyzone: -1 | 0 | 1 = 0;

  @serializable buyzone_time = 0;
  @serializable spectating = false;

  /** The gun other players see in this player's hand, or on the back while the axe is out. */
  @serializable protected _heldGun: HeldWeaponEntity | null = null;

  /** The axe: in the hand while it is the weapon in use, in its holster on the back while a gun is. */
  @serializable protected _heldAxe: HeldWeaponEntity | null = null;

  /** The last weapon that was not the axe: the gun the model keeps on the back. */
  @serializable protected _lastGun: WeaponConfigKey | 0 = 0;

  static override _modelPlayer = 'progs/player.iqm';

  static override clientEntityFields = [
    ...PlayerEntity.clientEntityFields,
    'money',
    'health',
    'spectating',
  ];

  static override clientdataFields = [
    ...PlayerEntity.clientdataFields,
    'buyzone',
    'spectating',
  ];

  static override _backpackLimits = {
    ...PlayerEntity._backpackLimits,
    ammo_shells: 500,
    ammo_nails: 500,
    ammo_rockets: 200,
    ammo_cells: 600,
  };

  static override _precache(engineAPI: ServerEngineAPI): void {
    super._precache(engineAPI);

    for (const model of HeldWeaponEntity.models) {
      engineAPI.PrecacheModel(model);
    }
  }

  override setWeapon(weapon: WeaponConfigKey | 0 = this.weapon): void {
    super.setWeapon(weapon);

    if (this.weapon !== 0 && this.weapon !== items.IT_AXE) {
      this._lastGun = this.weapon;
    }

    this._syncHeldWeapons();
  }

  /**
   * Makes the weapons the player carries match the weapon in use: the last gun always, in the hand or, while the axe is out, on the back
   * (the animation takes care of that), and the axe always, in the hand or, while a gun is out, in its holster on the back. Nothing is carried by a player who is dead, spectating or invisible (the eyes model has no tags). Cheap and idempotent, so
   * it can run whenever something about the player changed, and every frame.
   */
  protected _syncHeldWeapons(): void {
    if (this.edict === null) {
      return;
    }

    const carrying = !this.spectating && this.deadflag === dead.DEAD_NO && (this.items & items.IT_INVISIBILITY) === 0;
    const gunModel = carrying ? HeldWeaponEntity.modelOf(this._lastGun) : null;
    const axeModel = carrying ? HeldWeaponEntity.modelOf(items.IT_AXE) : null;

    this._heldGun = HeldWeaponEntity.update(this as BaseEntity, this._heldGun, gunModel, GUN_TAG);
    this._heldAxe = HeldWeaponEntity.update(this as BaseEntity, this._heldAxe, axeModel, this.weapon === items.IT_AXE ? AXE_TAG : AXE_HOLSTER_TAG);
  }

  override thinkDie(attackerEntity: BaseEntity): void {
    super.thinkDie(attackerEntity);

    this._syncHeldWeapons(); // a corpse, and a pile of gibs, hold nothing
  }

  protected override _respawn(): void {
    switch ((this.game as ServerGameAPI).manager.phase) {
      case phases.quiet:
        super._respawn();
        break;

      case phases.normal:
      case phases.action:
        this._spectate();
        break;

      case phases.gameover:
        // trigger next map?
        break;
    }
  }

  protected override _applySpawnParameters(): void {
    // always make sure players start from zero
    this._freshSpawnParameters();
  }

  protected override _freshSpawnParameters(): void {
    this.items = items.IT_AXE;
    this.health = 100;
    this.armorvalue = 0;
    this.ammo_shells = 0;
    this.ammo_nails = 0;
    this.ammo_rockets = 0;
    this.ammo_cells = 0;
    this.weapon = items.IT_AXE;
    this.armortype = 0;
    this.money = 1000;
  }

  protected _spectate(): void {
    const origin = this.origin.copy();
    const angles = this.angles.copy();
    this.clear();
    this.setOrigin(origin);
    this.angles.set(angles);

    this.flags |= flags.FL_FLY | flags.FL_NOTARGET;
    this.movetype = moveType.MOVETYPE_NOCLIP;
    this.solid = solid.SOLID_NOT;
    this.unsetModel(false);

    this.weapon = 0;
    this.spectating = true;
    this._syncHeldWeapons();
  }

  protected _unspectate(): void {
    this.flags &= ~(flags.FL_FLY | flags.FL_NOTARGET);

    this.clear();

    this.spectating = false;
    this._syncHeldWeapons();
  }

  protected override _dropBackpack(): void {
    const moneyToDrop = Math.min(1000, this.money); // money capped to 1000 per backpack

    const spawnedBackpack = this.engine.SpawnEntity(HellwaveBackpackEntity.classname, {
      origin: this.origin.copy().subtract(new Vector(0.0, 0.0, 24.0)),
      items: this.items & (items.IT_LIGHTNING | items.IT_SUPER_NAILGUN | items.IT_NAILGUN | items.IT_ROCKET_LAUNCHER | items.IT_GRENADE_LAUNCHER | items.IT_SUPER_SHOTGUN | items.IT_SHOTGUN),
      ammo_cells: this.ammo_cells,
      ammo_nails: this.ammo_nails,
      ammo_rockets: this.ammo_rockets,
      ammo_shells: this.ammo_shells,
      money: moneyToDrop,
      regeneration_time: 0, // do not regenerate
      remove_after: 120, // remove after 120s
    });

    if (spawnedBackpack === null) {
      throw new TypeError('Expected HellwaveBackpackEntity spawn result');
    }

    const backpack = spawnedBackpack.entity! as HellwaveBackpackEntity;

    this.ammo_cells = 0;
    this.ammo_nails = 0;
    this.ammo_rockets = 0;
    this.ammo_shells = 0;
    this.items &= ~this.weapon | items.IT_AXE;

    this.updateMoney(-moneyToDrop);

    // toss it around
    backpack.toss();
  }

  protected _dropMoney(): void {
    if (this.money < 100) {
      return; // not enough money to drop
    }

    const { forward } = this.angles.angleVectors();

    const origin = this.origin.copy().subtract(new Vector(0.0, 0.0, 24.0)).add(forward.multiply(64.0));

    const trace = this.traceline(this.origin, origin, false);

    if (trace.fraction < 1.0) {
      origin.set(trace.point);
      origin.add(trace.plane.normal.copy().multiply(4.0));
    }

    const spawnedBackpack = this.engine.SpawnEntity(HellwaveBackpackEntity.classname, {
      origin,
      angles: this.angles.copy(),
      money: 100,
      regeneration_time: 0, // do not regenerate
      remove_after: 120, // remove after 120s
      pain_finished: this.game.time + 0.5, // make it untouchable for a split second
    });

    if (spawnedBackpack === null) {
      throw new TypeError('Expected HellwaveBackpackEntity spawn result');
    }

    const backpack = spawnedBackpack.entity! as HellwaveBackpackEntity;

    this.updateMoney(-backpack.money);
  }

  override applyBackpack(backpack: BackpackPickup): boolean {
    let backpackUsed = super.applyBackpack(backpack);
    const ownedBackpack = backpack as OwnedBackpackPickup;

    if (ownedBackpack.owner && !ownedBackpack.owner.equals(this)) {
      // backpack already owned by this player (bought from the buyzone)
      return false;
    }

    if (backpack instanceof HellwaveBackpackEntity && backpack.money > 0) {
      this.updateMoney(backpack.money);
      backpackUsed = true;
    }

    return backpackUsed;
  }

  override connected(): void {
    super.connected();

    this.money = 1000;
  }

  override disconnected(): void {
    this._heldGun?.remove();
    this._heldAxe?.remove();
    this._heldGun = null;
    this._heldAxe = null;

    if (!this.spectating) {
      super.disconnected();
      return;
    }

    this.engine.BroadcastPrint(`${this.netname} left the game.\n`);
  }

  override putPlayerInServer(): void {
    const manager = (this.game as ServerGameAPI).manager;

    // update client on stats
    this.game.stats.sendToPlayer(this);
    this.updateMoney();

    const shouldSpectate = manager.phase !== phases.quiet && manager.phase !== phases.waiting;

    if (shouldSpectate) {
      this._spectate();
    } else {
      this._unspectate();
    }

    // select spawn spot
    const spot = shouldSpectate ? this._intermissionFindSpot() : this._selectSpawnPoint();
    this.origin = spot.origin.copy().add(new Vector(0.0, 0.0, 1.0));
    this.angles = spot.angles.copy();
    this.angles[2] = 0; // do not apply roll
    this.setOrigin(this.origin);
  }

  protected override _handleImpulseCommands(): void {
    switch (this.impulse) {
      case 20:
        this._dropMoney();
        this.impulse = 0;
        break;

      case 101: // money cheat
        if (this._canUseCheats()) {
          this.updateMoney(10000);
        }
        this.impulse = 0;
        break;
    }

    const buyItemId = fromBuyImpulse(this.impulse);

    if (buyItemId !== null) {
      this._buyMenuPurchase(buyItemId as BuyMenuItemId);
      this.impulse = 0;
    }

    super._handleImpulseCommands();
  }

  protected override _weaponFrame(): void {
    if (this.spectating) {
      return; // no weapon handling while spectating
    }

    super._weaponFrame();
  }

  protected _buyMenuPurchase(item: BuyMenuItemId): void {
    if (this.buyzone !== 1) {
      this.dispatchEvent(clientEvent.BUY_MESSAGE, 'you are not in a buyzone!');
      return;
    }

    const menuItem = buyMenuItems[item];

    if (!menuItem) {
      this.dispatchEvent(clientEvent.BUY_MESSAGE, `invalid buy menu item ${item}!`);
      return;
    }

    if (menuItem.available && !menuItem.available(this)) {
      this.dispatchEvent(clientEvent.BUY_MESSAGE, `you already have ${menuItem.label}`);
      return;
    }

    if (this.money < menuItem.cost) {
      this.dispatchEvent(clientEvent.BUY_MESSAGE, `you need ${formatMoney(menuItem.cost)} to buy that!`);
      return;
    }

    // take the money
    this.updateMoney(-menuItem.cost);
    this.dispatchEvent(clientEvent.BUY_MESSAGE, `bought ${menuItem.label}!`);

    // spawn entity to pick up
    if (menuItem.entityClass) {
      this.engine.SpawnEntity(menuItem.entityClass.classname, {
        origin: this.origin.copy().add(this.view_ofs),
        angles: this.angles.copy(),
        owner: this, // make it only consumable by this player
        spawnflags: menuItem.spawnflags ?? 0,
      });
    }

    // apply backpack
    if (menuItem.backpack) {
      if (this.applyBackpack(Object.assign(new HellwaveBackpack(), menuItem.backpack))) {
        this.startSound(channel.CHAN_WEAPON, 'weapons/lock4.wav');
      }
    }
  }

  updateMoney(difference = 0): void {
    this.money += difference;
    this.dispatchEvent(clientEvent.MONEY_UPDATE, this.money);
  }

  override playerPostThink(): void {
    super.playerPostThink();

    this._syncHeldWeapons();

    if ((this.game as ServerGameAPI).manager.phase !== phases.quiet) {
      this.buyzone = -1;
      return;
    }

    // reset buyzone state once left the zone
    // TODO: double check for what game phase we are in
    if ((this.game.time - this.buyzone_time) > 0.1) {
      this.buyzone = 0;
    } else if (this.buyzone === 0) {
      this.buyzone = 1; // inside the zone
    }
  }
}
