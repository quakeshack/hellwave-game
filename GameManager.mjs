import Vector from '../../shared/Vector.mjs';
import { clientEvent, items } from './Defs.mjs';
import HellwavePayer from './entity/hellwave/Player.mjs';
import { BuyZoneEntity } from './entity/hellwave/Zones.mjs';
import { BaseItemEntity, HealthItemEntity, ItemShellsEntity, ItemSpikesEntity, SuperDamageEntity } from './entity/Items.mjs';
import { TeleportEffectEntity } from './entity/Misc.mjs';
import BaseMonster from './entity/monster/BaseMonster.mjs';
import DogMonsterEntity from './entity/monster/Dog.mjs';
import { HellKnightMonster, KnightMonster } from './entity/monster/Knights.mjs';
import OgreMonsterEntity from './entity/monster/Ogre.mjs';
import { ShalrathMissileEntity } from './entity/monster/Shalrath.mjs';
import ShamblerMonsterEntity from './entity/monster/Shambler.mjs';
import { ArmyEnforcerMonster, ArmySoldierMonster } from './entity/monster/Soldier.mjs';
import WizardMonsterEntity from './entity/monster/Wizard.mjs';
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
  victory: 'victory', // all rounds complete, waiting for intermission
});

const gameRoundMonsterMatrix = {
  1: [
    { classname: ZombieMonster.classname, probability: 0.3, limit: 1 },
    { classname: DogMonsterEntity.classname, probability: 1.0 },
    { classname: ArmyEnforcerMonster.classname, probability: 1.0, limit: 1 },
    { classname: ArmySoldierMonster.classname, probability: 1.0 },
    { classname: KnightMonster.classname, probability: 0.2, limit: 2 },
  ],
  2: [
    { classname: ZombieMonster.classname, probability: 0.5, limit: 5 },
    { classname: ArmyEnforcerMonster.classname, probability: 1.0, limit: 5 },
    { classname: ArmySoldierMonster.classname, probability: 0.75 },
    { classname: KnightMonster.classname, probability: 0.5 },
  ],
  3: [
    { classname: ArmySoldierMonster.classname, probability: 0.2 },
    { classname: WizardMonsterEntity.classname, probability: 0.2 },
    { classname: OgreMonsterEntity.classname, probability: 1.0 },
    { classname: ZombieMonster.classname, probability: 0.2 },
    { classname: KnightMonster.classname, probability: 0.5 },
    { classname: HellKnightMonster.classname, probability: 0.2, limit: 3 },
  ],
  4: [
    { classname: WizardMonsterEntity.classname, probability: 0.3 },
    { classname: OgreMonsterEntity.classname, probability: 1.0 },
    { classname: ShamblerMonsterEntity.classname, probability: 0.1, limit: 1 },
    { classname: ZombieMonster.classname, probability: 0.5 },
    { classname: KnightMonster.classname, probability: 1.0 },
    { classname: HellKnightMonster.classname, probability: 0.5 },
    { classname: ArmySoldierMonster.classname, probability: 1.0 },
  ],
  5: [
    { classname: WizardMonsterEntity.classname, probability: 0.3 },
    { classname: OgreMonsterEntity.classname, probability: 1.0 },
    { classname: ShamblerMonsterEntity.classname, probability: 0.2, limit: 1 },
    { classname: ShalrathMissileEntity.classname, probability: 0.7, limit: 3 },
    { classname: ZombieMonster.classname, probability: 0.2, limit: 3 },
    { classname: HellKnightMonster.classname, probability: 1.0 },
    { classname: ArmySoldierMonster.classname, probability: 1.0 },
    { classname: ArmyEnforcerMonster.classname, probability: 0.2 },
  ],
  6: [
    { classname: WizardMonsterEntity.classname, probability: 0.3 },
    { classname: OgreMonsterEntity.classname, probability: 1.0 },
    { classname: ShamblerMonsterEntity.classname, probability: 0.3, limit: 1 },
    { classname: ZombieMonster.classname, probability: 0.5 },
    { classname: KnightMonster.classname, probability: 1.0 },
    { classname: HellKnightMonster.classname, probability: 0.5 },
    { classname: ArmySoldierMonster.classname, probability: 1.0 },
  ],
  7: [
    { classname: WizardMonsterEntity.classname, probability: 0.3 },
    { classname: OgreMonsterEntity.classname, probability: 1.0 },
    { classname: ShamblerMonsterEntity.classname, probability: 0.2, limit: 1 },
    { classname: ShalrathMissileEntity.classname, probability: 0.7, limit: 3 },
    { classname: ZombieMonster.classname, probability: 0.2, limit: 3 },
    { classname: HellKnightMonster.classname, probability: 1.0 },
    { classname: ArmySoldierMonster.classname, probability: 1.0 },
    { classname: ArmyEnforcerMonster.classname, probability: 0.2 },
  ],
  8: [
    { classname: WizardMonsterEntity.classname, probability: 0.3 },
    { classname: OgreMonsterEntity.classname, probability: 1.0 },
    { classname: ShamblerMonsterEntity.classname, probability: 1.0, limit: 2 },
    { classname: ZombieMonster.classname, probability: 0.5 },
    { classname: KnightMonster.classname, probability: 1.0 },
    { classname: ArmySoldierMonster.classname, probability: 1.0 },
    { classname: HellKnightMonster.classname, probability: 1.0 },
    { classname: ArmyEnforcerMonster.classname, probability: 0.2 },
  ],
  9: [
    { classname: WizardMonsterEntity.classname, probability: 0.3 },
    { classname: ZombieMonster.classname, probability: 0.5 },
    { classname: KnightMonster.classname, probability: 1.0 },
    { classname: HellKnightMonster.classname, probability: 0.5 },
    { classname: ArmySoldierMonster.classname, probability: 1.0 },
    { classname: OgreMonsterEntity.classname, probability: 1.0 },
    { classname: ShamblerMonsterEntity.classname, probability: 0.2, limit: 2 },
    { classname: ShalrathMissileEntity.classname, probability: 0.7 },
    { classname: ArmyEnforcerMonster.classname, probability: 0.2 },
  ],
  10: [
    { classname: DogMonsterEntity.classname, probability: 1.0 },
    { classname: ArmyEnforcerMonster.classname, probability: 1.0, limit: 5 },
    { classname: ArmySoldierMonster.classname, probability: 0.75 },
    { classname: HellKnightMonster.classname, probability: 0.5 },
    { classname: KnightMonster.classname, probability: 0.75 },
  ],
  11: [
    { classname: WizardMonsterEntity.classname, probability: 0.5 },
    { classname: OgreMonsterEntity.classname, probability: 1.0 },
    { classname: ShamblerMonsterEntity.classname, probability: 1.0, limit: 1 },
    { classname: ArmySoldierMonster.classname, probability: 1.0 },
    { classname: HellKnightMonster.classname, probability: 1.0 },
  ],
  12: [
    { classname: DogMonsterEntity.classname, probability: 1.0 },
    { classname: OgreMonsterEntity.classname, probability: 1.0 },
    { classname: ShamblerMonsterEntity.classname, probability: 1.0, limit: 1 },
    { classname: ArmySoldierMonster.classname, probability: 1.0 },
    { classname: ArmyEnforcerMonster.classname, probability: 1.0, limit: 5 },
    { classname: ArmySoldierMonster.classname, probability: 1.0, limit: 5 },
    { classname: WizardMonsterEntity.classname, probability: 0.5, limit: 5 },
  ],
};

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

    this.round_number = 0;
    this.round_number_limit = 0;

    /** @type {number} how many monsters to spawn within this round */
    this.round_monsters_limit = 0;

    /** @type {number} timer to send out hints to get to the buyzone */
    this.next_hint_time = 0;

    /** @type {BuyZoneEntity?} randomly selected buy zone during quiet phase */
    this.designed_buyzone = null;

    /** @type {number} maximum amount of goodies (health, ammo, etc.) to drop when monsters die */
    this.available_goodies = 0;

    /** @type {number} maximum amount of quad damage powerups to drop when monsters die */
    this.available_goodies_quad = 0;

    /** @type {boolean} whether to initialize game state */
    this.gameInitialized = false;

    this._serializer.endFields();
  }

  openRandomShop() {
    if (this.designed_buyzone) {
      return; // already open
    }

    const zones = Array.from(this.engine.FindAllByFilter((edict) => edict.entity instanceof BuyZoneEntity));

    /** @type {BuyZoneEntity?} */
    const zone = zones[Math.floor(Math.random() * zones.length)]?.entity;

    if (zone) {
      zone.openShop();
      this.designed_buyzone = zone;
    }

    this.engine.BroadcastPrint('Store is open!\n'); // TODO: publish client event
  }

  closeShops() {
    for (const edict of Array.from(this.engine.FindAllByFilter((edict) => edict.entity instanceof BuyZoneEntity))) {
      /** @type {BuyZoneEntity} */
      const zone = edict.entity;
      zone.closeShop();
    }

    this.designed_buyzone = null;

    this.engine.BroadcastPrint('Store is closed!\n'); // TODO: publish client event
  }

  subscribeToEvents() {
    this.engine.eventBus.subscribe('game.phase.changed', (newPhase) => {
      if (newPhase === phases.quiet) {
        this.openRandomShop();
      } else if (newPhase === phases.normal) {
        this.closeShops();
      }
    });

    this.engine.eventBus.subscribe('game.player.died', (player, attacker) => {
      this.checkSquadStatus(null);

      // friendly fire money penalty
      if (attacker instanceof HellwavePayer && attacker !== player) {
        attacker.updateMoney(-500);
      }
    });

    this.engine.eventBus.subscribe('game.monster.killed', (monster, attacker) => {
      if (attacker instanceof HellwavePayer) {
        attacker.updateMoney(100); // TODO: different money for different monsters
        attacker.frags++;

        if (Math.random() < 0.2 && this.available_goodies > 0) {
          this.dropGoodie(monster, attacker);
          this.available_goodies--;
        }
      }

      // bump the navigation hint each time
      this.next_hint_time = this.game.time + 15.0;
    });
  }

  dropItem(entityClassname, origin, params = {}) {
    const item = /** @type {BaseItemEntity} */(this.engine.SpawnEntity(entityClassname, {
      origin: origin.copy(),
      regeneration_time: 0, // do not regenerate
      remove_after: 120, // remove after 2 minutes
      ...params,
    }));

    console.assert(item instanceof BaseItemEntity, 'dropped item is not a BaseItemEntity');

    // toss it around
    item.toss();
  }

  dropGoodie(monster, attacker) {
    if (attacker.health < 25) {
      this.dropItem(HealthItemEntity.classname, monster.origin);
      return;
    }

    if ((attacker.items & (items.IT_NAILGUN | items.IT_SUPER_NAILGUN)) && attacker.ammo_nails < 20) {
      this.dropItem(ItemSpikesEntity.classname, monster.origin, {
        ammo_nails: 50,
      });
      return;
    }

    if ((attacker.items & (items.IT_SHOTGUN | items.IT_SUPER_SHOTGUN)) && attacker.ammo_shells < 10) {
      this.dropItem(ItemShellsEntity.classname, monster.origin);
      return;
    }

    if (Math.random() < 0.25 && (
      (this.available_goodies_quad > 0) &&
      (this.game.stats.monsters_total - this.game.stats.monsters_killed) > 50
    )) {
      this.dropItem(SuperDamageEntity, monster.origin);
      this.available_goodies_quad--;
      return;
    }
  }

  spawnEnemies() {
    if (this.spawn_next > this.game.time) {
      return;
    }

    if (this.game.maxmonstersalive > 0) {
      const clients = Array.from(this.engine.GetClients()).length;

      if (this.game.stats.monsters_total - this.game.stats.monsters_killed >= this.game.maxmonstersalive * clients) {
        return; // too many monsters alive
      }
    }

    if (this.game.stats.monsters_total >= this.round_monsters_limit) {
      return; // reached the limit for this round
    }

    if (this.spawnpoints.length === 0) {
      return; // no spawn points
    }

    if (this.phase !== phases.normal && this.phase !== phases.action) {
      return; // no longer valid
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

    this.spawn_next = this.game.time + (this.phase === phases.action ? 0.5 : 3.0);

    const goalentity = this.engine.FindInRadius(origin, 4096.0, (edict) => edict.entity instanceof PlayerEntity)[0]?.entity || null;

    // determine what to spawn
    const monsterChoices = gameRoundMonsterMatrix[Math.min(this.round_number, Math.max(...Object.keys(gameRoundMonsterMatrix).map((k) => parseInt(k, 10))))] || []; // TODO: default

    let totalProbability = 0.0;

    for (const choice of monsterChoices) {
      if (choice.limit && choice.limit > 0) {
        const existing = Array.from(this.engine.FindAllByFieldAndValue('classname', choice.classname));

        if (existing.length >= choice.limit) {
          continue; // reached the limit for this monster type
        }
      }
      totalProbability += choice.probability;
    }

    if (totalProbability <= 0.0) {
      return; // nothing to spawn
    }

    let r = Math.random() * totalProbability;
    let selectedChoice = null;

    for (const choice of monsterChoices) {
      if (choice.limit && choice.limit > 0) {
        const existing = Array.from(this.engine.FindAllByFieldAndValue('classname', choice.classname));

        if (existing.length >= choice.limit) {
          continue; // reached the limit for this monster type
        }
      }

      if (r < choice.probability) {
        selectedChoice = choice;
        break;
      }

      r -= choice.probability;
    }

    if (!selectedChoice) {
      return; // no monster selected
    }

    // spawn a zombie monster
    const enemy = /** @type {BaseMonster} */ (this.engine.SpawnEntity(selectedChoice.classname, {
      origin,
      enemy: goalentity,
      // TODO: facing angle (should face player)
    }));

    this.engine.SpawnEntity(TeleportEffectEntity.classname, { origin });

    // console.debug(`spawned enemy ${enemy} at ${origin} goal ${goalentity}`, enemy);

    // send off into the world
    if (goalentity !== null) {
      enemy.hunt(goalentity);
    }
  }

  startFrame() {
    this.assessGameState();
  }

  showNavigationBuyzoneHint() {
    if (!this.designed_buyzone) {
      return; // no buyzone to go to
    }

    for (const clientEdict of this.engine.GetClients()) {
      /** @type {HellwavePayer} */
      const player = clientEdict.entity;

      if (player.spectating || player.buyzone) {
        continue; // skip spectators and players already in the buyzone
      }

      const start = player.origin.copy();
      const end = this.designed_buyzone.centerPoint.copy();

      this.engine.NavigateAsync(start, end).then((navpath) => {
        if (!navpath || clientEdict.isFree()) {
          return;
        }

        const path = navpath.map((v) => v.add(player.view_ofs));
        const visiblePath = path; // TODO: only send waypoints that are visible

        this.engine.DispatchClientEvent(clientEdict, false, clientEvent.NAV_HINT, ...visiblePath);
      });
    }
  }

  showLastEnemyHint() {
    const lastMonster = Array.from(this.engine.FindAllByFilter((edict) => (edict.entity instanceof BaseMonster) && edict.entity.health > 0))[0]?.entity;

    if (!lastMonster) {
      return; // no monster found
    }

    for (const clientEdict of this.engine.GetClients()) {
      /** @type {HellwavePayer} */
      const player = clientEdict.entity;

      if (player.spectating) {
        continue; // skip spectators
      }

      const start = player.origin.copy();
      const end = lastMonster.centerPoint.copy();

      if (start.distanceTo(end) < 128.0) {
        continue; // too close
      }

      const navpath = this.engine.Navigate(start, end);

      if (!navpath) {
        continue; // no valid path
      }

      const path = navpath.map((v) => v.add(player.view_ofs));
      const visiblePath = path; // TODO: only send waypoints that are visible

      this.engine.DispatchClientEvent(clientEdict, false, clientEvent.NAV_HINT, ...visiblePath);
    }
  }

  /**
   * Assess the current game state and make changes if necessary.
   * In this method we have all rules and checks that need to be done every frame.
   */
  assessGameState() {
    if (this.game.intermission_running > 0) {
      // do not interfere during intermission
      return;
    }

    switch (this.phase) {
      // buy time, players can spawn
      case phases.quiet:
        if (this.phase_ending_time <= this.game.time) {
          // TODO: better event to the players
          this.startNormalPhase();
        }
        if (this.next_hint_time <= this.game.time) {
          this.showNavigationBuyzoneHint();
          this.next_hint_time = this.game.time + 5.0;
        }
        break;

      // main game loop, spawning enemies and checking for round end
      case phases.action:
      case phases.normal:
        if (this.phase_ending_time <= this.game.time) {
          this.startActionPhase();
          break;
        }
        if (this.game.stats.monsters_killed >= this.round_monsters_limit) {
          this.roundFinished();
          break;
        }
        this.spawnEnemies();
        // help out finding the last enemy
        if (this.round_monsters_limit - this.game.stats.monsters_killed <= 3) {
          if (this.next_hint_time <= this.game.time) {
            this.showLastEnemyHint();
            this.next_hint_time = this.game.time + 5.0;
          }
        }
        break;

      // transition to next map
      case phases.victory:
      case phases.gameover:
        if (this.phase_ending_time <= this.game.time) {
          this.game.gameover = true;
          this.game.loadNextMap();
        }
        break;

      // waiting for players to join
      case phases.waiting:
        break;
    }
  }

  roundFinished() {
    this.engine.BroadcastPrint('Round complete! Well done!\n');
    // TODO: better event to the players
    this.startNextRound();
  }

  /**
   * Start the next round, if possible.
   * It will also set all the necessary variables and settings for the upcoming phases.
   */
  startNextRound() {
    if (this.round_number === this.round_number_limit) {
      this.engine.ConsolePrint('Maximum number of rounds reached.\n');
      this.startVictoryPhase();
      return;
    }

    // cleaning up all the corpses
    for (const edict of this.engine.FindAllByFilter((edict) => edict.entity instanceof BaseMonster)) {
      const entity = /** @type {BaseMonster} */(edict.entity);
      entity._scheduleThink(this.game.time + Math.random() * 5.0 + 2.5, function() { this.remove(); });
    }

    this.round_number++;

    const clients = Array.from(this.engine.GetClients()).length;

    const start = 20, end = 200;
    const ratio = this.round_number_limit > 1 ? (this.round_number - 1) / (this.round_number_limit - 1) : 0;

    this.round_monsters_limit = start + Math.floor((end - start) * ratio * clients);

    this.available_goodies = Math.ceil(this.round_monsters_limit / 10);
    this.available_goodies_quad = Math.floor(this.round_monsters_limit / 30);

    this.engine.eventBus.publish('game.round.started', this.round_number, this.round_number_limit, this.round_monsters_limit);

    this.startQuietPhase();

    // make sure that we spawn all spectating players
    for (const clent of this.engine.GetClients()) {
      const player = /** @type {HellwavePayer} */(clent.entity);

      if (!player.spectating) {
        continue; // not spectating
      }

      player.putPlayerInServer();
    }
  }

  startQuietPhase() {
    this.next_hint_time = this.game.time + 3.0;

    this.phase = phases.quiet;
    this.phase_ending_time = this.game.time + this.game.quiettime;

    this.engine.eventBus.publish('game.phase.changed', this.phase);
    this.engine.eventBus.publish('game.phase.endingtime', this.phase_ending_time);

    this.engine.PlayTrack(0, 0);
  }

  startNormalPhase() {
    this.spawn_next = this.game.time + 5.0; // wait a bit before spawning the first enemy

    this.phase = phases.normal;
    this.phase_ending_time = this.game.time + this.game.normaltime;

    this.engine.eventBus.publish('game.phase.changed', this.phase);
    this.engine.eventBus.publish('game.phase.endingtime', this.phase_ending_time);

    this.engine.PlayTrack(this.game.worldspawn.sounds, this.game.worldspawn.sounds);
  }

  startActionPhase() {
    this.phase = phases.action;
    this.phase_ending_time = Infinity;

    this.engine.eventBus.publish('game.phase.changed', this.phase);
    this.engine.eventBus.publish('game.phase.endingtime', 0);
  }

  startGameOverPhase() {
    this.engine.PlayTrack(3, 3);

    this.phase = phases.gameover;
    this.phase_ending_time = this.game.time + 5.0; // 5 seconds until next map

    this.engine.eventBus.publish('game.phase.changed', this.phase);
    this.engine.eventBus.publish('game.phase.endingtime', 0);
  }

  startVictoryPhase() {
    this.game.startIntermission();

    this.phase = phases.victory;
    this.phase_ending_time = this.game.time + 30.0; // 30 seconds until forcefully next map

    this.engine.eventBus.publish('game.phase.changed', this.phase);
    this.engine.eventBus.publish('game.phase.endingtime', 0);
  }

  /**
   * @param {PlayerEntity} playerEntity player
   */
  // eslint-disable-next-line no-unused-vars
  clientConnected(playerEntity) {
    // we initialize the game once the first player connects
    if (!this.gameInitialized) {
      this.#initGame();
      this.gameInitialized = true;
    }
  }

  /**
   * @param {PlayerEntity} playerEntity player
   */
  clientDisconnected(playerEntity) {
    this.checkSquadStatus(playerEntity);
  }

  /**
   * @param {PlayerEntity} playerEntity player
   */
  // eslint-disable-next-line no-unused-vars
  clientBeing(playerEntity) {
    switch (this.phase) {
      case phases.waiting:
        this.startNextRound();
      // eslint-disable-next-line no-fallthrough
      case phases.quiet:
        // regular spawn
        break;

      default:
        // spawn as spectator
        break;
    }
  }

  checkSquadStatus(skipPlayerEntity = null) {
    let squadTotal = 0, squadStanding = 0;

    for (const clientEdict of this.engine.GetClients()) {
      /** @type {HellwavePayer} */
      const player = clientEdict.entity;

      if (skipPlayerEntity && player.equals(skipPlayerEntity)) {
        continue; // skip the leaving player
      }

      if (player.spectating) {
        continue; // skip spectators
      }

      squadTotal++;

      if (player.health <= 0) {
        continue;
      }

      squadStanding++;
    }

    this.game.stats.updateSquadStats(squadStanding, squadTotal); // TODO: turn into an event

    if (squadTotal <= 0) {
      this.engine.ConsolePrint('no players left in the game\n');
      this.resetGame();
      return;
    }

    if (squadStanding <= 0) {
      this.engine.ConsolePrint('all players are dead\n');
      this.startGameOverPhase();
      return;
    }

    this.engine.ConsolePrint(`squad standing ${squadStanding}/${squadTotal}\n`);
  }

  #initGame() {
    // make sure all shops are closed
    this.closeShops();
  }

  resetGame() {
    this.engine.ChangeLevel(this.game.mapname);
  }
};
