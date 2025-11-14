import Vector from '../../../shared/Vector.mjs';
import { moveType, solid } from '../Defs.mjs';
import HellwavePlayer from './Player.mjs';
import { WallEntity } from './Props.mjs';
import { phases } from '../GameManager.mjs';
import { BaseTriggerEntity } from '../../id1/entity/Triggers.mjs';
import BaseEntity from '../../id1/entity/BaseEntity.mjs';
import { DebugMarkerEntity, LightEntity, TeleportEffectEntity } from '../../id1/entity/Misc.mjs';
import { ServerGameAPI } from '../GameAPI.mjs';

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
    this.isOpen = false;
    this._serializer.endFields();
  }

  /**
   * @param {BaseEntity} other touching entity
   */
  touch(other) {
    if (!(other instanceof HellwavePlayer)) {
      return;
    }

    other.buyzone_time = this.game.time;

    this._playerInsideTime[other.edictId] = this.game.time;

    if (/** @type {ServerGameAPI} */(this.game).manager.phase !== phases.quiet) {
      this.#teleportPlayerOutOfBuyzone(other);
    }
  }

  *#getConnectedLights() {
    for (const entity of this.findAllEntitiesByFieldAndValue('targetname', this.target)) {
      if (entity instanceof LightEntity) {
        yield /** @type {LightEntity} */(entity);
      }
    }
  }

  *#getConnectedShutters() {
    for (const entity of this.findAllEntitiesByFieldAndValue('targetname', this.target)) {
      if (entity instanceof BuyZoneShuttersEntity) {
        yield /** @type {BuyZoneShuttersEntity} */(entity);
      }
    }
  }

  *#getPlayerSpawnzones() {
    for (const entity of this.findAllEntitiesByFieldAndValue('targetname', this.target)) {
      if (entity instanceof PlayersSpawnZoneEntity) {
        yield /** @type {PlayersSpawnZoneEntity} */(entity);
      }
    }
  }

  /** @param {HellwavePlayer} player player */
  #teleportPlayerOutOfBuyzone(player) {
    const spawnzones = Array.from(this.#getPlayerSpawnzones())[0];

    if (!spawnzones) {
      this.engine.ConsoleWarning('no spawnzones found, cannot kick players out of buyzone\n');
      return;
    }

    const spawnpoint = spawnzones.spawnpoints[player.edictId - 1];

    player.setOrigin(spawnpoint);

    this.engine.SpawnEntity(TeleportEffectEntity.classname, { origin: spawnpoint });
  }

  closeShop() {
    this.isOpen = false;

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
      const player = /** @type {HellwavePlayer} */(this.engine.GetEdictById(i).entity);

      if (this.game.time - this._playerInsideTime[i] <= 0.1) {
        const spawnpoint = spawnzones.spawnpoints[i - 1];

        player.setOrigin(spawnpoint);

        this.engine.SpawnEntity(TeleportEffectEntity.classname, { origin: spawnpoint });
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

    this.isOpen = true;
  }

  spawn() {
    console.assert(this.target, 'target required, so we can find connected shutters and lights');

    this.solid = solid.SOLID_TRIGGER;
    this.movetype = moveType.MOVETYPE_NONE;
    this.setModel(this.model); // sets size and absmin/absmax
    this.unsetModel(false);

    this._scheduleThink(this.game.time + 0.1, function () { this.openShop(); });
  }
};

/**
 * QUAKED func_buyzone_shutters (0.5 0 0.5) ?
 * Buyzone shutters. Will close when the round starts.
 *
 * style: 0 - default, shutters are closed when the buyzone is closed
 *        1 - inverted, shutters are closed when the buyzone is open
 */
export class BuyZoneShuttersEntity extends WallEntity {
  static classname = 'func_buyzone_shutters';

  static STYLE_DEFAULT = 0;
  static STYLE_INVERTED = 1;

  _declareFields() {
    super._declareFields();

    this._serializer.startFields();
    this.style = 0;
    this._serializer.endFields();
  }

  show() {
    if (this.style === BuyZoneShuttersEntity.STYLE_DEFAULT) {
      super.show();
    } else {
      super.hide();
    }
  }

  hide() {
    if (this.style === BuyZoneShuttersEntity.STYLE_DEFAULT) {
      super.hide();
    } else {
      super.show();
    }
  }
};

/**
 * QUAKED func_spawnzone_monsters (0.5 0 0.5) ?
 * Spawn area. Monsters will be spawned inside this area.
 */
export class MonstersSpawnZoneEntity extends BaseEntity {
  static classname = 'func_spawnzone_monsters';

  spawn() {
    this.setModel(this.model); // sets size and absmin/absmax

    const game = /** @type {ServerGameAPI} */ (this.game);

    // const availableHeight = this.maxs[2] - this.mins[2] - 8.0;
    for (let x = this.mins[0] + 40.0; x <= this.maxs[0]; x += 80.0) {
      for (let y = this.mins[1] + 40.0; y <= this.maxs[1]; y += 80.0) {
        const origin = new Vector(x, y, this.mins[2] + 24.0);

        if (game.debug_spawnpoints) {
          this.engine.SpawnEntity(DebugMarkerEntity.classname, {
            origin,
          });
        }

        game.manager.spawnpoints.push(origin); // TODO: register available height too
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

    const game = /** @type {ServerGameAPI} */ (this.game);

    // const availableHeight = this.maxs[2] - this.mins[2] - 8.0;
    for (let x = this.mins[0] + 40.0; x <= this.maxs[0]; x += 80.0) {
      for (let y = this.mins[1] + 40.0; y <= this.maxs[1]; y += 80.0) {
        const origin = new Vector(x, y, this.mins[2] + 24.0);

        if (game.debug_spawnpoints) {
          this.engine.SpawnEntity(DebugMarkerEntity.classname, {
            origin,
          });
        }

        this.spawnpoints.push(origin); // TODO: register available height too
      }
    }

    console.assert(this.spawnpoints.length >= this.engine.maxplayers, 'have at least maxplayers spawnpoints');

    // no longer needed, we sampled the spawnpoints
    this.unsetModel(false);
  }
};
