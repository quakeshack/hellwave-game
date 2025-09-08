import Vector from '../../shared/Vector.mjs';
import ZombieMonster from './entity/monster/Zombie.mjs';
import { PlayerEntity } from './entity/Player.mjs';
import { ServerGameAPI } from './GameAPI.mjs';
import { Serializer } from './helper/MiscHelpers.mjs';

export default class GameManager {
  static PHASE_WAITING = 'waiting';
  static PHASE_QUIET = 'quiet';
  static PHASE_NORMAL = 'normal';
  static PHASE_ACTION = 'action';

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

    this.phase = '';

    this._serializer.endFields();

    this.subscribeToEvents();
  }

  subscribeToEvents() {

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

  }

  /**
   * @param {PlayerEntity} playerEntity player
   */
  // eslint-disable-next-line no-unused-vars
  clientConnected(playerEntity) {
    // TODO:
    // - during quiet phase, spawn at a random spawn point
    // - during normal and active phase, become a spectator until the next round starts
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
};
