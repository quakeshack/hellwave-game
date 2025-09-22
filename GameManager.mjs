import Vector from '../../shared/Vector.mjs';
import { BuyZoneEntity } from './entity/hellwave/Zones.mjs';
import ZombieMonster from './entity/monster/Zombie.mjs';
import { PlayerEntity } from './entity/Player.mjs';
import { ServerGameAPI } from './GameAPI.mjs';
import { Serializer } from './helper/MiscHelpers.mjs';

/** @enum {string} @readonly */
export const phases = Object.freeze({
  waiting: 'waiting', // waiting for players
  quiet: 'quiet', // players can spawn, no monsters
  normal: 'normal', // monsters spawn normally
  action: 'action', // monsters spawn more frequently
  gameover: 'gameover', // game over, waiting for intermission
});

export default class GameManager {

  /**
   * @param {ServerGameAPI} game game
   */
  constructor(game) {
    this.game = game;
    this.engine = game.engine;

    this._serializer = new Serializer(this, game.engine);

    this._serializer.startFields();

    /** @type {Vector[]} */
    this.spawnpoints = [];
    this.spawn_next = 0.0;

    /** @type {keyof typeof phases} */
    this.phase = phases.waiting;
    this.phase_ending_time = 0; // game.time + X, in seconds

    this._serializer.endFields();
  }

  openRandomShop() {
    const zones = Array.from(this.engine.FindAllByFieldAndValue('classname', BuyZoneEntity.classname));

    /** @type {BuyZoneEntity?} */
    const zone = zones[Math.floor(Math.random() * zones.length)]?.entity;

    if (zone) {
      zone.openShop();
    }

    this.engine.BroadcastPrint('Store is open!');
  }

  closeShops() {
    for (const entity of this.engine.FindAllByFieldAndValue('classname', BuyZoneEntity.classname)) {
      /** @type {BuyZoneEntity} */
      const zone = entity.entity;
      zone.closeShop();
    }

    this.engine.BroadcastPrint('Store is closed!');
  }

  subscribeToEvents() {
    this.engine.eventBus.subscribe('game.phase.changed', (newPhase) => {
      if (newPhase === phases.quiet) {
        this.openRandomShop();
      } else {
        this.closeShops();
      }
    });
  }


  spawnEnemies() {
    if (this.spawn_next > this.game.time || this.game.time < 2.0) {
      return;
    }

    if (this.game.stats.monsters_total - this.game.stats.monsters_killed >= 20) {
      return; // too many monsters alive
    }

    if (this.spawnpoints.length === 0) {
      return; // no spawn points
    }

    const origin = new Vector();
    const mins = new Vector(-16, -16, 0);
    const maxs = new Vector(16, 16, 16);

    const offset = Math.floor(Math.random() * this.spawnpoints.length);
    for (let i = 0; i < this.spawnpoints.length; i++) {
      const spot = this.spawnpoints[(i + offset) % this.spawnpoints.length].copy();

      // this is an insane way to check whether the spot is free, but we have to trace from potentially outside the entity to inside, we simply assume there’s nothing above it
      const trace = this.engine.Traceline(spot.copy().add([0, 0, 64.0]), spot, false, 0, mins, maxs);

      if (trace.fraction < 1.0) {
        continue; // spot is blocked
      }

      origin.set(spot);
      origin[2] += 16.0; // spawn at 16 units above the ground
      break; // found a spawn point
    }

    if (origin.isOrigin()) {
      return; // no spawn point found
    }

    const goalentity = this.engine.FindInRadius(origin, 512.0, (edict) => edict.entity instanceof PlayerEntity)[0]?.entity || null;

    // spawn a zombie monster
    const enemy = /** @type {ZombieMonster} */ (this.engine.SpawnEntity(ZombieMonster.classname, {
      origin,
      enemy: goalentity,
      // TODO: facing angle (should face player)
    }));

    console.log(`spawned enemy ${enemy} at ${origin} goal ${goalentity}`, enemy);

    // send off into the world
    if (goalentity !== null) {
      enemy.hunt(goalentity);
    }

    this.spawn_next = this.game.time + 1.0; // spawn next enemy in 1 second

  }

  startFrame() {
    this.checkGameState();
  }

  checkGameState() {
    switch (this.phase) {
      case phases.quiet:
        if (this.phase_ending_time < this.game.time) {
          this.startNormalPhase();
        }
        break;
    }
  }

  startQuietPhase() {
    this.phase = phases.quiet;
    this.phase_ending_time = this.game.time + this.game.quiettime;

    this.engine.eventBus.publish('game.phase.changed', phases.quiet);
    this.engine.eventBus.publish('game.phase.endingtime', this.phase_ending_time);
  }

  startNormalPhase() {
    this.phase = phases.normal;
    this.phase_ending_time = -1;

    this.engine.eventBus.publish('game.phase.changed', phases.normal);
    this.engine.eventBus.publish('game.phase.endingtime', this.phase_ending_time);
  }

  /**
   * @param {PlayerEntity} playerEntity player
   */
  // eslint-disable-next-line no-unused-vars
  clientConnected(playerEntity) {
    // TODO:
    // - during quiet phase, spawn at a random spawn point
    // - during normal and active phase, become a spectator until the next round starts

    switch (this.phase) {
      case phases.waiting:
        this.startQuietPhase();
        break;
      case phases.quiet:
      case phases.normal:
      case phases.action:
      case phases.gameover:
        // TODO: spawn as spectator
        break;
    }
  }

  /**
   * @param {PlayerEntity} playerEntity player
   */
  clientDisconnected(playerEntity) {
    let squadTotal = 0, squadStanding = 0;

    for (const clientEdict of this.engine.GetClients()) {
      /** @type {PlayerEntity} */
      const player = clientEdict.entity;

      if (player.equals(playerEntity)) {
        continue; // skip the leaving player
      }

      squadTotal++;

      if (player.health <= 0) {
        continue;
      }

      squadStanding++;
    }

    if (squadTotal === 0) {
      this.engine.ConsolePrint('no players left in the game\n');
      this.resetGame();
      return;
    }

    if (squadStanding === 0) {
      this.engine.ConsolePrint('all players are dead\n');
      // TODO: game over event / intermission
      return;
    }

    this.engine.ConsolePrint(`squad standing ${squadStanding}/${squadTotal}\n`);
    this.game.stats.updateSquadStats(squadStanding, squadTotal);
  }

  resetGame() {
    this.engine.ConsolePrint('resetting game\n');
  }
};
