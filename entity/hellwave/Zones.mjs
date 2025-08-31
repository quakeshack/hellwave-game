import Vector from '../../../../shared/Vector.mjs';
import { moveType, solid } from '../../Defs.mjs';
import BaseEntity from '../BaseEntity.mjs';
import { BaseLightEntity, DebugMarkerEntity, LightEntity } from '../Misc.mjs';
import BaseMonster from '../monster/BaseMonster.mjs';
import { PlayerEntity, TelefragTriggerEntity } from '../Player.mjs';
import { BaseTriggerEntity } from '../Triggers.mjs';

/**
 * QUAKED func_buyzone (0.5 0 0.5) ?
 * Buyzone. Players can buy items while inside this zone.
 * Will be automatically kicked out when the round starts.
 * It’s also mastering connected entities such as shutters and lights.
 */
export class BuyZoneEntity extends BaseTriggerEntity {
  static classname = 'func_buyzone';

  _declareFields() {
    super._declareFields();

    this._serializer.startFields();
    /** @type {number[]} */
    this._playerInsideTime = [];
    this._serializer.endFields();
  }

  /**
   * @param {BaseEntity} other touching entity
   */
  touch(other) {
    if (!(other instanceof PlayerEntity)) {
      return;
    }

    this._playerInsideTime[other.edictId] = this.game.time;
  }

  *#getConnectedLights() {
    for (const entity of this.findAllEntitiesByFieldAndValue('targetname', this.target)) {
      if (entity instanceof LightEntity) {
        yield entity;
      }
    }
  }

  *#getConnectedShutters() {
    for (const entity of this.findAllEntitiesByFieldAndValue('targetname', this.target)) {
      if (entity instanceof BuyZoneShuttersEntity) {
        yield entity;
      }
    }
  }

  *#getPlayerSpawnzones() {
    for (const entity of this.findAllEntitiesByFieldAndValue('targetname', this.target)) {
      if (entity instanceof PlayersSpawnZoneEntity) {
        yield entity;
      }
    }
  }

  closeShop() {
    for (const light of this.#getConnectedLights()) {
      light.off();
    }

    for (const shutter of this.#getConnectedShutters()) {
      shutter.show();
    }

    const spawnzones = Array.from(this.#getPlayerSpawnzones())[0];

    if (!spawnzones) {
      this.engine.ConsoleWarning('no spawnzones found, cannot kick players out of buyzone\n');
      return;
    }

    for (let i = 1; i <= this.engine.maxplayers + 1; i++) {
      const player = /** @type {PlayerEntity} */(this.engine.GetEdictById(i));

      if (this.game.time - this._playerInsideTime[i] <= 0.1) {
        const spawnpoint = spawnzones.spawnpoints[i - 1];

        player.setOrigin(spawnpoint);
      }
    }
  }

  openShop() {
    for (const light of this.#getConnectedLights()) {
      light.on();
    }

    for (const shutter of this.#getConnectedShutters()) {
      shutter.hide();
    }
  }

  spawn() {
    console.assert(this.target, 'target required, so we can find connected shutters and lights');

    this.solid = solid.SOLID_TRIGGER;
    this.movetype = moveType.MOVETYPE_NONE;
    this.setModel(this.model); // sets size and absmin/absmax
    this.unsetModel(false);

    this._scheduleThink(this.game.time + 0.1, function () { this.closeShop(); });

    // testing stuff:
    this._scheduleThink(this.game.time + 5.0, function () { this.openShop(); });
    this._scheduleThink(this.game.time + 15.0, function () { this.closeShop(); });
  }
};

/**
 * QUAKED func_buyzone_shutters (0.5 0 0.5) ?
 * Buyzone shutters. Will close when the round starts.
 */
export class BuyZoneShuttersEntity extends BaseEntity {
  static classname = 'func_buyzone_shutters';

  _declareFields() {
    super._declareFields();

    this._serializer.startFields();
    this._shownModel = null;
    this._serializer.endFields();
  }

  spawn() {
    this._shownModel = this.model;

    this.hide();
  }

  show() {
    this.solid = solid.SOLID_BSP;
    this.movetype = moveType.MOVETYPE_PUSH;

    this.setModel(this._shownModel);
  }

  hide() {
    this.solid = solid.SOLID_NOT;
    this.movetype = moveType.MOVETYPE_NONE;

    this.unsetModel();
  }
};

/**
 * QUAKED func_spawnzone_monsters (0.5 0 0.5) ?
 * Spawn area. Monsters will be spawned inside this area.
 */
export class MonstersSpawnZoneEntity extends BaseEntity {
  static classname = 'func_spawnzone_monsters';

  _precache() {
    this.engine.PrecacheModel('progs/zombie.mdl');
    this.engine.PrecacheModel('progs/h_zombie.mdl');
  }

  spawn() {
    this.setModel(this.model); // sets size and absmin/absmax

    // const availableHeight = this.maxs[2] - this.mins[2] - 8.0;
    for (let x = this.mins[0] + 40.0; x <= this.maxs[0]; x += 80.0) {
      for (let y = this.mins[1] + 40.0; y <= this.maxs[1]; y += 80.0) {
        const origin = new Vector(x, y, this.mins[2] + 24.0);

        this.engine.SpawnEntity(DebugMarkerEntity.classname, {
          origin,
        });

        this.game.manager.spawnpoints.push(origin); // TODO: register available height too
      }
    }

    // no longer needed, we sampled the spawnpoints
    this.remove();
  }
};

/**
 * QUAKED func_spawnzone_players (0.5 0 0.5) ?
 * Spawn area. Players will be teleported inside this area when they get kicked out of the buyzone.
 */
export class PlayersSpawnZoneEntity extends BaseEntity {
  static classname = 'func_spawnzone_players';

  _declareFields() {
    super._declareFields();

    this._serializer.startFields();

    /** @type {Vector[]} */
    this.spawnpoints = [];

    this._serializer.endFields();
  }

  spawn() {
    this.setModel(this.model); // sets size and absmin/absmax

    // const availableHeight = this.maxs[2] - this.mins[2] - 8.0;
    for (let x = this.mins[0] + 40.0; x <= this.maxs[0]; x += 80.0) {
      for (let y = this.mins[1] + 40.0; y <= this.maxs[1]; y += 80.0) {
        const origin = new Vector(x, y, this.mins[2] + 24.0);

        this.engine.SpawnEntity(DebugMarkerEntity.classname, {
          origin,
        });

        this.spawnpoints.push(origin); // TODO: register available height too
      }
    }

    console.assert(this.spawnpoints.length >= this.engine.maxplayers, 'have at least maxplayers spawnpoints');
  }
};

/** @deprecated no longer required */
export class  SpawnClearanceEntity extends TelefragTriggerEntity {
  static classname = 'misc_spawn_clearance';

  touch(touchedByEntity) {
    if (touchedByEntity.equals(this.owner)) {
      return;
    }

    if (!(touchedByEntity instanceof BaseMonster)) {
      return;
    }

    touchedByEntity.lazyRemove();
  }
};
