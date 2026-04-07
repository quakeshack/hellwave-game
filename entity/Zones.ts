import type HellwavePlayer from './Player.ts';
import type { ServerGameAPI } from '../GameAPI.ts';

import Vector from '../../../shared/Vector.ts';

import { entity, serializable } from '../../id1/helper/MiscHelpers.ts';
import BaseEntity from '../../id1/entity/BaseEntity.ts';
import { DebugMarkerEntity, LightEntity, TeleportEffectEntity } from '../../id1/entity/Misc.ts';
import { PlayerEntity } from '../../id1/entity/Player.ts';
import { BaseTriggerEntity } from '../../id1/entity/Triggers.ts';

import { moveType, solid } from '../Defs.ts';
import { phases } from '../Phases.ts';

import { WallEntity } from './Props.ts';

/**
 * QUAKED func_buyzone (0.5 0 0.5) ?
 * Buyzone. Players can buy items while inside this zone.
 * Will be automatically kicked out when the round starts.
 * It's also mastering connected entities such as shutters and lights.
 */
@entity
export class BuyZoneEntity extends BaseTriggerEntity {
  static classname = 'func_buyzone';

  @serializable _playerInsideTime: number[] = [];
  @serializable isOpen = false;

  override touch(other: BaseEntity): void {
    if (!(other instanceof PlayerEntity)) {
      return;
    }

    const player = other as HellwavePlayer;
    const playerEdictId = player.edictId;
    console.assert(playerEdictId !== undefined, 'BuyZoneEntity.touch requires a player edict id');
    if (playerEdictId === undefined) {
      return;
    }

    player.buyzone_time = this.game.time;
    this._playerInsideTime[playerEdictId] = this.game.time;

    if ((this.game as ServerGameAPI).manager.phase !== phases.quiet) {
      this.#teleportPlayerOutOfBuyzone(player);
    }
  }

  *#getConnectedLights(): Generator<LightEntity> {
    if (this.target === null) {
      return;
    }

    for (const entity of this.findAllEntitiesByFieldAndValue('targetname', this.target)) {
      if (entity instanceof LightEntity) {
        yield entity;
      }
    }
  }

  *#getConnectedShutters(): Generator<BuyZoneShuttersEntity> {
    if (this.target === null) {
      return;
    }

    for (const entity of this.findAllEntitiesByFieldAndValue('targetname', this.target)) {
      if (entity instanceof BuyZoneShuttersEntity) {
        yield entity;
      }
    }
  }

  *#getPlayerSpawnzones(): Generator<PlayersSpawnZoneEntity> {
    if (this.target === null) {
      return;
    }

    for (const entity of this.findAllEntitiesByFieldAndValue('targetname', this.target)) {
      if (entity instanceof PlayersSpawnZoneEntity) {
        yield entity;
      }
    }
  }

  #teleportPlayerOutOfBuyzone(player: HellwavePlayer): void {
    const spawnzones = Array.from(this.#getPlayerSpawnzones())[0] ?? null;

    if (spawnzones === null) {
      this.engine.ConsoleWarning('no spawnzones found, cannot kick players out of buyzone\n');
      return;
    }

    const playerEdictId = player.edictId;
    console.assert(playerEdictId !== undefined, 'BuyZoneEntity requires a player edict id');
    if (playerEdictId === undefined) {
      return;
    }

    const spawnpoint = spawnzones.spawnpoints[playerEdictId - 1] ?? null;
    console.assert(spawnpoint !== null, 'BuyZoneEntity requires a spawnpoint for each connected player');
    if (spawnpoint === null) {
      return;
    }

    player.setOrigin(spawnpoint);
    this.engine.SpawnEntity(TeleportEffectEntity.classname, { origin: spawnpoint });
  }

  closeShop(): void {
    this.isOpen = false;

    for (const light of this.#getConnectedLights()) {
      light.off();
    }

    for (const shutter of this.#getConnectedShutters()) {
      shutter.show();
    }

    const spawnzones = Array.from(this.#getPlayerSpawnzones())[0] ?? null;

    if (spawnzones === null) {
      this.engine.ConsoleWarning('no spawnzones found, cannot kick players out of buyzone\n');
      return;
    }

    for (let i = 1; i <= this.engine.maxplayers + 1; i++) {
      const playerEntity = this.engine.GetEdictById(i).entity;

      if (!(playerEntity instanceof PlayerEntity)) {
        continue;
      }

      const insideTime = this._playerInsideTime[i];

      if (insideTime === undefined || (this.game.time - insideTime) > 0.1) {
        continue;
      }

      const spawnpoint = spawnzones.spawnpoints[i - 1] ?? null;
      if (spawnpoint === null) {
        continue;
      }

      playerEntity.setOrigin(spawnpoint);
      this.engine.SpawnEntity(TeleportEffectEntity.classname, { origin: spawnpoint });
    }
  }

  openShop(): void {
    for (const light of this.#getConnectedLights()) {
      light.on();
    }

    for (const shutter of this.#getConnectedShutters()) {
      shutter.hide();
    }

    this.isOpen = true;
  }

  override spawn(): void {
    console.assert(this.target !== null, 'target required, so we can find connected shutters and lights');
    console.assert(this.model !== null, 'Buyzone brush entities require a model');
    if (this.model === null) {
      return;
    }

    this.solid = solid.SOLID_TRIGGER;
    this.movetype = moveType.MOVETYPE_NONE;
    this.setModel(this.model);
    this.unsetModel(false);

    this._scheduleThink(this.game.time + 0.1, () => { this.openShop(); });
  }
}

/**
 * QUAKED func_buyzone_shutters (0.5 0 0.5) ?
 * Buyzone shutters. Will close when the round starts.
 *
 * style: 0 - default, shutters are closed when the buyzone is closed
 *        1 - inverted, shutters are closed when the buyzone is open
 */
@entity
export class BuyZoneShuttersEntity extends WallEntity {
  static classname = 'func_buyzone_shutters';

  static STYLE_DEFAULT = 0;
  static STYLE_INVERTED = 1;

  @serializable style = 0;

  override show(): void {
    if (this.style === BuyZoneShuttersEntity.STYLE_DEFAULT) {
      super.show();
      return;
    }

    super.hide();
  }

  override hide(): void {
    if (this.style === BuyZoneShuttersEntity.STYLE_DEFAULT) {
      super.hide();
      return;
    }

    super.show();
  }
}

/**
 * QUAKED func_spawnzone_monsters (0.5 0 0.5) ?
 * Spawn area. Monsters will be spawned inside this area.
 */
@entity
export class MonstersSpawnZoneEntity extends BaseEntity {
  static classname = 'func_spawnzone_monsters';

  override spawn(): void {
    console.assert(this.model !== null, 'Monster spawn zones require a model');
    if (this.model === null) {
      return;
    }

    this.setModel(this.model);

    const game = this.game as ServerGameAPI;

    for (let x = this.mins[0] + 40.0; x <= this.maxs[0]; x += 80.0) {
      for (let y = this.mins[1] + 40.0; y <= this.maxs[1]; y += 80.0) {
        const origin = new Vector(x, y, this.mins[2] + 24.0);

        if (game.debug_spawnpoints) {
          this.engine.SpawnEntity(DebugMarkerEntity.classname, { origin });
        }

        game.manager.spawnpoints.push(origin);
      }
    }

    this.remove();
  }
}

/**
 * QUAKED func_spawnzone_players (0.5 0 0.5) ?
 * Spawn area. Players will be teleported inside this area when they get kicked out of the buyzone.
 */
@entity
export class PlayersSpawnZoneEntity extends BaseEntity {
  static classname = 'func_spawnzone_players';

  @serializable spawnpoints: Vector[] = [];

  override spawn(): void {
    console.assert(this.model !== null, 'Player spawn zones require a model');
    if (this.model === null) {
      return;
    }

    this.setModel(this.model);

    const game = this.game as ServerGameAPI;

    for (let x = this.mins[0] + 40.0; x <= this.maxs[0]; x += 80.0) {
      for (let y = this.mins[1] + 40.0; y <= this.maxs[1]; y += 80.0) {
        const origin = new Vector(x, y, this.mins[2] + 24.0);

        if (game.debug_spawnpoints) {
          this.engine.SpawnEntity(DebugMarkerEntity.classname, { origin });
        }

        this.spawnpoints.push(origin);
      }
    }

    console.assert(this.spawnpoints.length >= this.engine.maxplayers, 'have at least maxplayers spawnpoints');
    this.unsetModel(false);
  }
}
