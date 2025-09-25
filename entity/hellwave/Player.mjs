import Vector from '../../../../shared/Vector.mjs';
import { channel, clientEvent, flags, items, moveType, solid } from '../../Defs.mjs';
import { phases } from '../../GameManager.mjs';
import { BackpackEntity, HealthItemEntity, LightArmorEntity, WeaponGrenadeLauncher, WeaponNailgun, WeaponRocketLauncher, WeaponSuperNailgun, WeaponSuperShotgun, WeaponThunderbolt } from '../Items.mjs';
import { PlayerEntity } from '../Player.mjs';
import { Backpack } from '../Weapons.mjs';

export const buyMenuItems = {
  1: { cost: 100, label: 'Armor', entityClass: LightArmorEntity },

  2: { cost: 200, label: 'Shotgun', backpack: { items: items.IT_SHOTGUN | items.IT_SHELLS, ammo_shells: 10 } },
  3: { cost: 1000, label: 'Super Shotgun', entityClass: WeaponSuperShotgun },

  4: { cost: 1000, label: 'Nailgun', entityClass: WeaponNailgun },
  5: { cost: 3000, label: 'Super Nailgun', entityClass: WeaponSuperNailgun },

  6: { cost: 5000, label: 'Grenade Launcher', entityClass: WeaponGrenadeLauncher },
  7: { cost: 5000, label: 'Rocket Launcher', entityClass: WeaponRocketLauncher },

  8: { cost: 8000, label: 'Thunderbolt', entityClass: WeaponThunderbolt },

  9: { cost: 1000, label: 'Megahealth', entityClass: HealthItemEntity, spawnflags: HealthItemEntity.H_MEGA },
};

export default class HellwavePayer extends PlayerEntity {
  static clientEntityFields = [
    ...PlayerEntity.clientEntityFields,
    'money',
    'health',
    'spectating',
  ];

  static clientdataFields = [
    ...PlayerEntity.clientdataFields,
    'buyzone',
    'spectating',
  ];

  // _playerDeathThink() {
  //   if (this.game.manager.phase !== phases.quiet) {
  //     this.button0 = false;
  //     this.button1 = false;
  //     this.button2 = false;
  //   }

  //   super._playerDeathThink();
  // }

  _respawn() {
    switch (this.game.manager.phase) {
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

  _declareFields() {
    super._declareFields();

    this._serializer.startFields();
    this.money = 0;
    /** @type {-1|0|1|2} -1 – not allowed, 0 – outside the zone, 1 – inside the zone, 2 – inside the buy menu */
    this.buyzone = 0;
    this.buyzone_time = 0;
    this.spectating = false;
    this._serializer.endFields();
  }

  /** @protected */
  _freshSpawnParameters() {
    this.items = items.IT_AXE;
    this.health = 100;
    this.armorvalue = 0;
    this.ammo_shells = 0;
    this.ammo_nails = 0;
    this.ammo_rockets = 0;
    this.ammo_cells = 0;
    this.weapon = items.IT_AXE;
    this.armortype = 0;
  }

  /** @protected */
  _spectate() {
    this.flags |= flags.FL_FLY | flags.FL_NOTARGET;
    this.movetype = moveType.MOVETYPE_NOCLIP;
    this.solid = solid.SOLID_NOT;
    this.unsetModel(false);

    this.weapon = 0;
    this.spectating = true;
  }

  _unspectate() {
    this.flags &= ~(flags.FL_FLY | flags.FL_NOTARGET);

    this.clear();

    this.spectating = false;
  }

  /** @protected */
  _dropBackpack() {
    const backpack = /** @type {BackpackEntity} */ (this.engine.SpawnEntity(BackpackEntity.classname, {
      origin: this.origin.copy().subtract(new Vector(0.0, 0.0, 24.0)),
      items: this.weapon,
      ammo_cells: this.ammo_cells,
      ammo_nails: this.ammo_nails,
      ammo_rockets: this.ammo_rockets,
      ammo_shells: this.ammo_shells,
      money: this.money, // Balancing: should we really drop money or only a little?
      regeneration_time: 0, // do not regenerate
      remove_after: 120, // remove after 120s
    }));

    this.ammo_cells = 0;
    this.ammo_nails = 0;
    this.ammo_rockets = 0;
    this.ammo_shells = 0;
    this.money = 0;
    this.items &= ~this.weapon | items.IT_AXE;

    // toss it around
    backpack.toss();
  }

  /** @protected */
  _dropMoney() {
    if (this.money < 100) {
      return; // not enough money to drop
    }

    const { forward } = this.angles.angleVectors();

    const backpack = /** @type {BackpackEntity} */ (this.engine.SpawnEntity(BackpackEntity.classname, {
      origin: this.origin.copy().subtract(new Vector(0.0, 0.0, 24.0)).add(forward.multiply(64.0)),
      angles: this.angles.copy(),
      money: 100,
      regeneration_time: 0, // do not regenerate
      remove_after: 120, // remove after 120s
      pain_finished: this.game.time + 0.5, // make it untouchable for a split second
    }));

    this.updateMoney(-backpack.money);
  }

  applyBackpack(backpack) {
    let backpackUsed = super.applyBackpack(backpack);

    if (backpack.money > 0) {
      this.updateMoney(backpack.money);
      backpackUsed = true;
    }

    return backpackUsed;
  }

  connected() {
    super.connected();

    this.money = 1000;
  }

  disconnected() {
    if (!this.spectating) {
      super.disconnected();
      return;
    }

    this.engine.BroadcastPrint(`${this.netname} left the game.\n`);
  }

  putPlayerInServer() {
    // select spawn spot
    const spot = this._selectSpawnPoint();
    this.origin = spot.origin.copy().add(new Vector(0.0, 0.0, 1.0));
    this.angles = spot.angles.copy();
    this.setOrigin(this.origin);

    // update client on stats
    this.game.stats.sendToPlayer(this);
    this.updateMoney();

    if (this.game.manager.phase !== phases.quiet && this.game.manager.phase !== phases.waiting) {
      this._spectate();
    } else {
      this._unspectate();
    }
  }

  _handleImpulseCommands() {
    switch (this.impulse) {
      case 20:
        this._dropMoney();
        this.impulse = 0;
        break;

      case 21: // toggle buy menu
        this._buyMenuRequested();
        this.impulse = 0;
        break;
    }

    if (this.buyzone === 2 && this.impulse > 0 && this.impulse <= 9) {
      this._buyMenuPurchase(this.impulse);
      this.impulse = 0;
    }

    super._handleImpulseCommands();
  }

  _weaponFrame() {
    if (this.spectating) {
      return; // no weapon handling while spectating
    }

    super._weaponFrame();
  }

  _buyMenuRequested() {
    switch (this.buyzone) {
      case -1:
        return;

      case 0:
        this.consolePrint('you are not in a buyzone!\n');
        return;

      case 2:
        this.buyzone = 1; // still inside the zone
        return;

      case 1:
        this.buyzone = 2; // inside the buy menu
        return;
    }
  }

  _buyMenuPurchase(item) {
    const menuItem = buyMenuItems[item];

    if (!menuItem) {
      this.consolePrint('invalid buy menu item ' + item + '\n');
      return;
    }

    if (this.money < menuItem.cost) {
      this.consolePrint('not enough money to buy item ' + item + ', need ' + menuItem.cost + '\n');
      return;
    }

    // take the money
    this.updateMoney(-menuItem.cost);

    // apply backpack
    if (menuItem.backpack) {
      if (this.applyBackpack(Object.assign(new Backpack(), menuItem.backpack))) {
        this.startSound(channel.CHAN_WEAPON, 'weapons/lock4.wav');
      }
    }

    // spawn entity to pick up
    if (menuItem.entityClass) {
      this.engine.SpawnEntity(menuItem.entityClass.classname, {
        origin: this.origin.copy(),
        angles: this.angles.copy(),
        spawnflags: menuItem.spawnflags || 0,
      });
    }
  }

  updateMoney(difference = 0) {
    this.money += difference;
    this.dispatchEvent(clientEvent.MONEY_UPDATE, this.money);
  }

  playerPostThink() {
    super.playerPostThink();

    if (this.game.manager.phase !== phases.quiet) {
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
};

