import Vector from '../../../../shared/Vector.mjs';
import { channel, clientEvent, flags, items, moveType } from '../../Defs.mjs';
import { BackpackEntity } from '../Items.mjs';
import { PlayerEntity } from '../Player.mjs';
import { Backpack } from '../Weapons.mjs';

export const buyMenuItems = {
  1: { cost: 200, label: 'Shotgun', backpack: { items: items.IT_SHOTGUN | items.IT_SHELLS, ammo_shells: 10 } },
  2: { cost: 400, label: 'Nailgun', backpack: { items: items.IT_NAILGUN | items.IT_NAILS, ammo_nails: 20 } },
  3: { cost: 800, label: 'Rocket Launcher', backpack: { items: items.IT_ROCKET_LAUNCHER | items.IT_ROCKETS, ammo_rockets: 5 } },
  4: { cost: 800, label: 'Grenade Launcher', backpack: { items: items.IT_GRENADE_LAUNCHER | items.IT_ROCKETS, ammo_rockets: 5 } },
  5: { cost: 100, label: 'Light Armor', backpack: { items: items.IT_ARMOR1 } }, // TODO: add armorvalue, armortype
};

export default class HellwavePayer extends PlayerEntity {
  static clientEntityFields = [
    ...PlayerEntity.clientEntityFields,
    'money',
    'health',
  ];

  static clientdataFields = [
    ...PlayerEntity.clientdataFields,
    'buyzone',
  ];

  _declareFields() {
    super._declareFields();

    this._serializer.startFields();
    this.money = 0;
    /** @type {0|1|2} 0 – outside the zone, 1 – inside the zone, 2 – inside the buy menu */
    this.buyzone = 0;
    this.buyzone_time = 0;
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
    this.unsetModel(true);

    this.weapon = 0;
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

  putPlayerInServer() {
    // select spawn spot
    const spot = this._selectSpawnPoint();
    this.origin = spot.origin.copy().add(new Vector(0.0, 0.0, 1.0));
    this.angles = spot.angles.copy();
    this.setOrigin(this.origin);

    // update client on stats
    this.game.stats.sendToPlayer(this);
    this.updateMoney();

    // this._spectate();
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

    if (this.buyzone === 2 && this.impulse > 0 && this.impulse < 9) {
      this._buyMenuPurchase(this.impulse);
      this.impulse = 0;
    }

    super._handleImpulseCommands();
  }

  _buyMenuRequested() {
    switch (this.buyzone) {
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
    if (this.applyBackpack(Object.assign(new Backpack(), menuItem.backpack))) {
      this.startSound(channel.CHAN_WEAPON, 'weapons/lock4.wav');
    }
  }

  updateMoney(difference = 0) {
    this.money += difference;
    this.dispatchEvent(clientEvent.MONEY_UPDATE, this.money);
  }

  playerPostThink() {
    super.playerPostThink();

    // reset buyzone state once left the zone
    // TODO: double check for what game phase we are in
    if ((this.game.time - this.buyzone_time) > 0.1) {
      this.buyzone = 0;
    } else if (this.buyzone === 0) {
      this.buyzone = 1; // inside the zone
    }
  }
};

