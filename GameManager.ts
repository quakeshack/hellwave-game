import type { EdictData, ServerEdict, ServerEngineAPI } from '../../shared/GameInterfaces.ts';
import type { ServerGameAPI } from './GameAPI.ts';
import type HellwaveStats from './helper/HellwaveStats.ts';

import Vector from '../../shared/Vector.ts';

import BaseEntity from '../id1/entity/BaseEntity.ts';
import { BaseItemEntity, HealthItemEntity, ItemCellsEntity, ItemShellsEntity, ItemSpikesEntity, LightArmorEntity, SuperDamageEntity, WEAPON_BIG2 } from '../id1/entity/Items.ts';
import { TeleportEffectEntity } from '../id1/entity/Misc.ts';
import BaseMonster from '../id1/entity/monster/BaseMonster.ts';
import DogMonsterEntity from '../id1/entity/monster/Dog.ts';
import { HellKnightMonster, KnightMonster } from '../id1/entity/monster/Knights.ts';
import OgreMonsterEntity from '../id1/entity/monster/Ogre.ts';
import { ShalrathMissileEntity } from '../id1/entity/monster/Shalrath.ts';
import ShamblerMonsterEntity from '../id1/entity/monster/Shambler.ts';
import { ArmyEnforcerMonster, ArmySoldierMonster } from '../id1/entity/monster/Soldier.ts';
import WizardMonsterEntity from '../id1/entity/monster/Wizard.ts';
import ZombieMonster from '../id1/entity/monster/Zombie.ts';
import { serializableObject, serializable, Serializer } from '../id1/helper/MiscHelpers.ts';

import { clientEvent, items, solid } from './Defs.ts';
import HellwavePlayer from './entity/Player.ts';
import { BuyZoneEntity } from './entity/Zones.ts';
import { phases, type HellwavePhase } from './Phases.ts';
import { HellwaveBossMonsterSpawnMarker } from './entity/BossMonsters.ts';

interface MonsterSpawnChoice {
  readonly classname: string;
  readonly probability: number;
  readonly limit?: number;
}

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
    { classname: OgreMonsterEntity.classname, probability: 1.0, limit: 3 },
    { classname: ZombieMonster.classname, probability: 0.2 },
    { classname: KnightMonster.classname, probability: 0.5 },
    { classname: HellKnightMonster.classname, probability: 0.2, limit: 3 },
  ],
  4: [
    { classname: WizardMonsterEntity.classname, probability: 0.3 },
    { classname: OgreMonsterEntity.classname, probability: 1.0, limit: 5 },
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
} satisfies Record<number, readonly MonsterSpawnChoice[]>;

const highestConfiguredRound = Math.max(...Object.keys(gameRoundMonsterMatrix).map(Number));

/**
 * Return whether the monster choice is still below its concurrent spawn cap.
 * @returns True when the choice may still be spawned.
 */
function canSpawnChoice(engine: ServerEngineAPI, choice: MonsterSpawnChoice): boolean {
  if (choice.limit === undefined || choice.limit <= 0) {
    return true;
  }

  const existing = Array.from(engine.FindAllByFieldAndValue('classname', choice.classname));
  return existing.length < choice.limit;
}

/**
 * Resolve the configured monster table for the current round.
 * @returns Spawn choices for the current or last configured round.
 */
function getMonsterChoicesForRound(roundNumber: number): readonly MonsterSpawnChoice[] {
  const roundKey = Math.min(roundNumber, highestConfiguredRound) as keyof typeof gameRoundMonsterMatrix;
  return gameRoundMonsterMatrix[roundKey] ?? gameRoundMonsterMatrix[1];
}

/**
 * Drives Hellwave round phases, spawn pacing, and squad progression.
 */
@serializableObject
export default class GameManager {
  readonly game: ServerGameAPI;
  readonly engine: ServerEngineAPI;
  readonly _serializer: Serializer<GameManager>;

  /** Spawn positions gathered from monster spawn-zone brushes. */
  @serializable spawnpoints: Vector[] = [];
  /** Absolute game time when the next monster spawn may happen. */
  @serializable spawn_next = 0.0;
  /** Current round phase. */
  @serializable phase: HellwavePhase = phases.waiting;
  /** Absolute game time when the current phase ends. */
  @serializable phase_ending_time = 0;
  @serializable round_number = 0;
  @serializable round_number_limit = 0;
  /** Maximum monsters that can spawn during the current round. Ignored during bossfight. */
  @serializable round_monsters_limit = 0;
  /** Absolute game time when the next navigation hint may be sent. */
  @serializable next_hint_time = 0;
  /** Selected buy zone during the quiet phase. */
  @serializable designed_buyzone: BuyZoneEntity | null = null;
  /** Remaining number of health or ammo drops allowed this round. */
  @serializable available_goodies = 0;
  /** Remaining number of quad-damage drops allowed this round. */
  @serializable available_goodies_quad = 0;
  /** Whether a boss fight can occur on the current map. Will be set to false when all bosses are defeated to stop the enemy spawner. */
  @serializable canHaveBossfight = false;
  /** Whether the one-time startup init ran after the first connect. */
  @serializable gameInitialized = false;

  constructor(game: ServerGameAPI) {
    this.game = game;
    this.engine = game.engine;
    this._serializer = new Serializer(this, game.engine);
  }

  protected openRandomShop(): void {
    if (this.designed_buyzone !== null) {
      return;
    }

    const zones: BuyZoneEntity[] = [];

    for (const edict of this.engine.FindAllByFilter((candidate) => candidate.entity instanceof BuyZoneEntity)) {
      const zone = edict.entity;

      if (zone instanceof BuyZoneEntity) {
        zones.push(zone);
      }
    }

    const zone = zones[Math.floor(Math.random() * zones.length)] ?? null;

    if (zone !== null) {
      zone.openShop();
      this.designed_buyzone = zone;
    }

    this.engine.BroadcastPrint('Store is open!\n');
  }

  protected closeShops(): void {
    for (const edict of this.engine.FindAllByFilter((candidate) => candidate.entity instanceof BuyZoneEntity)) {
      const zone = edict.entity;

      if (zone instanceof BuyZoneEntity) {
        zone.closeShop();
      }
    }

    this.designed_buyzone = null;
    this.engine.BroadcastPrint('Store is closed!\n');
  }

  subscribeToEvents(): void {
    this.engine.eventBus.subscribe('game.phase.changed', (newPhase: HellwavePhase): void => {
      if (newPhase === phases.quiet) {
        this.openRandomShop();
      } else if (newPhase === phases.normal) {
        this.closeShops();
      }
    });

    this.engine.eventBus.subscribe('game.player.died', (player: HellwavePlayer, attacker: BaseEntity): void => {
      this.checkSquadStatus(null);

      if (attacker instanceof HellwavePlayer && attacker !== player) {
        attacker.updateMoney(-500);
      }
    });

    this.engine.eventBus.subscribe('game.monster.killed', (monster: BaseMonster, attacker: BaseEntity): void => {
      if (attacker instanceof HellwavePlayer) {
        attacker.updateMoney(100);
        attacker.frags += 1;

        this.dropGoodie(monster, attacker);
      }

      monster._scheduleThink(this.game.time + Math.random() * 10.0 + 5.0, function (this: BaseMonster): void {
        this.remove();
      });

      this.next_hint_time = this.game.time + 15.0;
    });
  }

  #configureGameSettings(): void {
    this.round_number_limit = Math.max(1, Math.min(12, this.game.rounds));
  }

  #initBossVictoryConditions() {
    // 1. find the info_boss_marker to determine the boss monster for this map
    // 2. count how many there are
    // 3. hook up the game.monster.killed event
    // 4. 10 seconds after the last boss is killed, end the round and declare victory

    const bossMarkers = Array.from(this.engine.FindAllByFieldAndValue('classname', HellwaveBossMonsterSpawnMarker.classname));

    if (bossMarkers.length === 0) {
      this.engine.ConsoleDebug('No info_boss_marker found for this map. Surviving last round will turn into victory.');
      this.canHaveBossfight = false;
      return;
    }

    // we can have a boss fight on this map
    this.canHaveBossfight = true;

    const bosses = new Set<string>();

    // collect the boss classnames from the markers
    for (const { entity } of bossMarkers) {
      console.assert(entity instanceof HellwaveBossMonsterSpawnMarker, 'info_boss_marker entity is not a HellwaveBossMonsterSpawnMarker');

      const marker = entity as HellwaveBossMonsterSpawnMarker;

      bosses.add(marker.bossClassname);
    }

    // actual counting
    let bossesRemaining = bossMarkers.length;
    const multipleBosses = bossesRemaining > 1;

    this.engine.eventBus.subscribe('game.monster.killed', (monster: BaseMonster): void => {
      // only pay attention when in bossfight phase
      if (this.phase !== phases.bossfight) {
        return;
      }

      // is it really a boss?
      if (!bosses.has(monster.classname)) {
        return;
      }

      // if the last boss was killed, schedule a victory after 10 seconds
      if (--bossesRemaining <= 0) {
        if (multipleBosses) {
          this.engine.BroadcastPrint('All bosses defeated! Well done!\n');
        } else {
          this.engine.BroadcastPrint('Boss defeated! Well done!\n');
        }

        this.phase_ending_time = this.game.time + 10.0;
        this.canHaveBossfight = false;
        return;
      }

      this.engine.BroadcastPrint(`One boss defeated! ${bossesRemaining} more to go!\n`);
    });
  }

  /**
   * Spawn a pickup entity and toss it into the world.
   */
  protected dropItem(entityClassname: string, origin: Vector, params: EdictData = {}): void {
    const spawnedItem = this.engine.SpawnEntity(entityClassname, {
      origin: origin.copy(),
      regeneration_time: 0,
      remove_after: 120,
      ...params,
    });

    const item = spawnedItem?.entity;
    console.assert(item instanceof BaseItemEntity, 'dropped item is not a BaseItemEntity');
    if (!(item instanceof BaseItemEntity)) {
      return;
    }

    item.toss();
  }

  /**
   * Drop a context-sensitive goodie from a killed monster.
   */
  protected dropGoodie(monster: BaseMonster, attacker: HellwavePlayer): void {
    if (attacker.health < 25 && this.available_goodies > 0) {
      this.dropItem(HealthItemEntity.classname, monster.origin, {
        // 10% chance of dropping a mega health, otherwise normal health.
        spawnflags: Math.random() < 0.1 ? HealthItemEntity.H_MEGA : HealthItemEntity.H_NORMAL,
      });
      this.available_goodies -= 1;
      return;
    }

    // If the player has no armor, 25% chance to drop a light armor item.
    if (attacker.armorvalue === 0 && Math.random() < 0.25 && this.available_goodies > 0) {
      this.dropItem(LightArmorEntity.classname, monster.origin, {
        message: `That was free armor for ${attacker.netname}!`,
      });
      this.available_goodies -= 1;
      return;
    }

    // 50% chance to drop ammo, prioritizing the weapon the player has equipped with low ammo.
    if (Math.random() < 0.5) {
      if ((attacker.items & (items.IT_NAILGUN | items.IT_SUPER_NAILGUN)) !== 0 && attacker.ammo_nails < 25) {
        this.dropItem(ItemSpikesEntity.classname, monster.origin, {
          ammo_nails: 50,
        });
        return;
      }

      if ((attacker.items & (items.IT_LIGHTNING)) !== 0 && attacker.ammo_cells < 25) {
        this.dropItem(ItemCellsEntity.classname, monster.origin, {
          ammo_cells: 50,
        });
        return;
      }
    }

    if ((attacker.items & (items.IT_SHOTGUN | items.IT_SUPER_SHOTGUN)) !== 0 && attacker.ammo_shells < 10) {
      this.dropItem(ItemShellsEntity.classname, monster.origin, {
        spawnflags: WEAPON_BIG2,
      });
      return;
    }

    if (Math.random() < 0.25
      && this.available_goodies_quad > 0
      && (this.game.stats.monsters_total - this.game.stats.monsters_killed) > 50
    ) {
      this.dropItem(SuperDamageEntity.classname, monster.origin);
      this.available_goodies_quad -= 1;
      return;
    }
  }

  protected spawnEnemies(): void {
    if (this.spawn_next > this.game.time) {
      return;
    }

    if (this.spawnpoints.length === 0) {
      return;
    }

    if (this.game.maxmonstersalive > 0) {
      const clients = Array.from(this.engine.GetClients()).length;

      if (this.game.stats.monsters_total - this.game.stats.monsters_killed >= this.game.maxmonstersalive * clients) {
        return;
      }
    }

    if (this.phase !== phases.bossfight) {
      if (this.game.stats.monsters_total >= this.round_monsters_limit) {
        return;
      }

      if (this.phase !== phases.normal && this.phase !== phases.action) {
        return;
      }
    }

    const origin = new Vector();
    const offset = Math.floor(Math.random() * this.spawnpoints.length);

    for (let i = 0; i < this.spawnpoints.length; i++) {
      const spot = this.spawnpoints[(i + offset) % this.spawnpoints.length].copy();

      // works better than traceline: Octree lookup (FindInRadius)
      const nearbyEntities = this.engine.FindInRadius(spot, 96.0, (edict) => edict.entity?.solid !== solid.SOLID_NOT);

      if (nearbyEntities.length > 0) {
        continue;
      }

      origin.set(spot);
      origin[2] += 1.0;
      break;
    }

    if (origin.isOrigin()) {
      return;
    }

    this.spawn_next = this.game.time + (this.phase === phases.action ? 0.5 : 3.0);

    const alivePlayers: HellwavePlayer[] = [];

    for (const clientEdict of this.engine.GetClients()) {
      const player = clientEdict.entity as HellwavePlayer;

      if (player.spectating || player.health <= 0) {
        continue;
      }

      if (player.origin.distanceTo(origin) <= 4096.0) {
        alivePlayers.push(player);
      }
    }

    alivePlayers.sort((left, right) => left.origin.distanceTo(origin) - right.origin.distanceTo(origin));
    const goalentity = alivePlayers[0] ?? null;

    const monsterChoices = getMonsterChoicesForRound(this.round_number);

    let totalProbability = 0.0;

    for (const choice of monsterChoices) {
      if (!canSpawnChoice(this.engine, choice)) {
        continue;
      }

      totalProbability += choice.probability;
    }

    if (totalProbability <= 0.0) {
      return;
    }

    let randomValue = Math.random() * totalProbability;
    let selectedChoice: MonsterSpawnChoice | null = null;

    for (const choice of monsterChoices) {
      if (!canSpawnChoice(this.engine, choice)) {
        continue;
      }

      if (randomValue < choice.probability) {
        selectedChoice = choice;
        break;
      }

      randomValue -= choice.probability;
    }

    if (selectedChoice === null) {
      return;
    }

    const angles = new Vector(0, Math.random() * 360.0, 0);

    if (goalentity !== null) {
      const direction = goalentity.origin.copy().subtract(origin);
      angles.set(direction.toAngles());
    }

    const spawnedEnemy = this.engine.SpawnEntity(selectedChoice.classname, {
      origin,
      enemy: goalentity?.edict ?? null,
      angles,
    });

    const enemy = spawnedEnemy?.entity;
    console.assert(enemy instanceof BaseMonster, 'spawnEnemies expects a BaseMonster entity');
    if (!(enemy instanceof BaseMonster)) {
      return;
    }

    this.engine.SpawnEntity(TeleportEffectEntity.classname, { origin });

    if (goalentity !== null) {
      enemy.hunt(goalentity);
    }
  }

  startFrame(): void {
    this.assessGameState();
  }

  protected showNavigationBuyzoneHint(): void {
    if (this.designed_buyzone === null) {
      return;
    }

    for (const clientEdict of this.engine.GetClients()) {
      const player = clientEdict.entity as HellwavePlayer;

      if (player.spectating || player.buyzone !== 0) {
        continue;
      }

      const start = player.origin.copy();
      const end = this.designed_buyzone.centerPoint.copy();

      void this.engine.NavigateAsync(start, end).then((navpath) => {
        if (navpath === null || clientEdict.isFree()) {
          return;
        }

        const visiblePath = navpath.map((waypoint) => waypoint.add(player.view_ofs));
        this.engine.DispatchClientEvent(clientEdict, false, clientEvent.NAV_HINT, ...visiblePath);
      }).catch(() => {
        this.engine.ConsoleWarning('Navigation for buzone hint failed.\n');
      });
    }
  }

  protected showLastEnemyHint(): void {
    let lastMonster: BaseMonster | null = null;

    for (const edict of this.engine.FindAllByFilter((candidate) => candidate.entity instanceof BaseMonster && candidate.entity.health > 0)) {
      const monster = edict.entity;

      if (monster instanceof BaseMonster) {
        lastMonster = monster;
        break;
      }
    }

    if (lastMonster === null) {
      return;
    }

    for (const clientEdict of this.engine.GetClients()) {
      const player = clientEdict.entity as HellwavePlayer;

      if (player.spectating) {
        continue;
      }

      const start = player.origin.copy();
      const end = lastMonster.centerPoint.copy();

      if (start.distanceTo(end) < 128.0) {
        continue;
      }

      const passEdict = player.edict;
      console.assert(passEdict !== null, 'showLastEnemyHint requires a player edict');
      if (passEdict === null) {
        continue;
      }

      if (this.engine.Traceline(start, end, false, passEdict).fraction === 1.0) {
        continue;
      }

      this.engine.NavigateAsync(start, end).then((navpath) => {
        if (navpath === null) {
          return;
        }

        const visiblePath = navpath.map((waypoint) => waypoint.add(player.view_ofs));
        this.engine.DispatchClientEvent(clientEdict, false, clientEvent.NAV_HINT, ...visiblePath);
      }).catch(() => {
        this.engine.ConsoleWarning('Navigation for last enemy hint failed.\n');
      });
    }
  }

  /**
   * Assess the current round state and transition phases when required.
   */
  protected assessGameState(): void {
    if (this.game.intermission_running > 0) {
      return;
    }

    switch (this.phase) {
      case phases.quiet:
        if (this.phase_ending_time <= this.game.time) {
          if (this.round_number === this.round_number_limit && this.round_number_limit > 0) {
            // in case the map does not support a boss fight, we can declare victory here
            if (!this.canHaveBossfight) {
              this.engine.ConsolePrint('You survived all rounds! Well done!\n');
              this.startVictoryPhase();
              return;
            }

            this.engine.ConsolePrint('No rest for the wicked, it is time for the boss fight!\n');
            this.startBossFightPhase();
            return;
          }

          this.startNormalPhase();
        }

        if (this.next_hint_time <= this.game.time) {
          this.showNavigationBuyzoneHint();
          this.next_hint_time = this.game.time + 5.0;
        }
        break;

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

        if (this.round_monsters_limit - this.game.stats.monsters_killed <= 3 && this.next_hint_time <= this.game.time) {
          this.showLastEnemyHint();
          this.next_hint_time = this.game.time + 5.0;
        }
        break;

      case phases.victory:
      case phases.gameover:
        if (this.phase_ending_time <= this.game.time) {
          this.game.gameover = true;
          this.game.loadNextMap();
        }
        break;

      case phases.bossfight:
        if (this.phase_ending_time <= this.game.time) {
          this.startVictoryPhase();
          return;
        }

        // as long as we are in the bossfight phase, we can spawn additional enemies to keep the players on their toes
        if (this.canHaveBossfight) {
          this.spawnEnemies();
        }
        break;

      case phases.waiting:
        break;
    }
  }

  protected roundFinished(): void {
    this.engine.BroadcastPrint('Round complete! Well done!\n');
    this.startNextRound();
  }

  /**
   * Start the next round and reinitialize round-scoped pacing variables.
   */
  protected startNextRound(): void {
    if (this.round_number >= this.round_number_limit && this.round_number_limit > 0) {
      this.engine.ConsolePrint('Maximum number of rounds reached.\n');
      this.startVictoryPhase();
      return;
    }

    for (const edict of this.engine.FindAllByFilter((candidate) => candidate.entity instanceof BaseMonster)) {
      const monster = edict.entity as BaseMonster;

      monster.lazyRemove();

      // TODO: would be cool to have a teleport out effect here
    }

    this.round_number += 1;

    const clients = Array.from(this.engine.GetClients()).length;
    const startMonsters = 20;
    const endMonsters = 200;
    const ratio = this.round_number_limit > 1 ? (this.round_number - 1) / (this.round_number_limit - 1) : 0;

    this.round_monsters_limit = startMonsters + Math.floor((endMonsters - startMonsters) * ratio * clients);
    this.available_goodies = Math.ceil(this.round_monsters_limit / 10) * clients;
    this.available_goodies_quad = Math.floor(this.round_monsters_limit / 30);

    this.engine.eventBus.publish('game.round.started', this.round_number, this.round_number_limit, this.round_monsters_limit);

    this.startQuietPhase();
    this.bringInNextRoundPlayers();
  }

  protected startBossFight(): void {
    const userEntity = (this.engine.GetClients().next().value as ServerEdict).entity! as HellwavePlayer;
    console.assert(userEntity instanceof HellwavePlayer, 'startBossFight requires at least one connected player');

    for (const edict of this.engine.FindAllByFilter((candidate) => candidate.entity instanceof HellwaveBossMonsterSpawnMarker)) {
      const spawnMarker = edict.entity as HellwaveBossMonsterSpawnMarker;

      const boss = this.engine.SpawnEntity(spawnMarker.bossClassname, {
        origin: spawnMarker.origin,
        angles: spawnMarker.angles,
      })!.entity as BaseEntity;

      // trigger the boss, if requested
      if (spawnMarker.useAfterSpawn) {
        boss.use(userEntity);
      }

      spawnMarker.use(userEntity);
    }

    // delay the spawning of more enemies
    this.spawn_next = this.game.time + 15.0;
  }

  protected bringInNextRoundPlayers(): void {
    for (const client of this.engine.GetClients()) {
      const player = client.entity as HellwavePlayer;

      if (!player.spectating) {
        continue;
      }

      player.putPlayerInServer();
    }
  }

  protected startQuietPhase(): void {
    this.next_hint_time = this.game.time + 3.0;

    this.phase = phases.quiet;
    this.phase_ending_time = this.game.time + this.game.quiettime;

    this.engine.eventBus.publish('game.phase.changed', this.phase);
    this.engine.eventBus.publish('game.phase.endingtime', this.phase_ending_time);

    this.engine.PlayTrack(0);
  }

  protected startNormalPhase(): void {
    this.spawn_next = this.game.time + 5.0;

    this.phase = phases.normal;
    this.phase_ending_time = this.game.time + this.game.normaltime;

    this.engine.eventBus.publish('game.phase.changed', this.phase);
    this.engine.eventBus.publish('game.phase.endingtime', this.phase_ending_time);

    const worldspawn = this.game.worldspawn!;
    console.assert(worldspawn !== null, 'Hellwave normal phase requires a worldspawn');

    this.engine.PlayTrack(worldspawn.sounds);
  }

  protected startActionPhase(): void {
    this.phase = phases.action;
    this.phase_ending_time = Infinity;

    this.engine.eventBus.publish('game.phase.changed', this.phase);
    this.engine.eventBus.publish('game.phase.endingtime', 0);
  }

  protected startGameOverPhase(): void {
    this.engine.PlayTrack(3);

    this.phase = phases.gameover;
    this.phase_ending_time = this.game.time + 5.0;

    this.engine.eventBus.publish('game.phase.changed', this.phase);
    this.engine.eventBus.publish('game.phase.endingtime', 0);
  }

  protected startVictoryPhase(): void {
    this.game.startIntermission(); // the only call to the original game structure

    this.phase = phases.victory;
    this.phase_ending_time = this.game.time + 30.0;

    this.engine.eventBus.publish('game.phase.changed', this.phase);
    this.engine.eventBus.publish('game.phase.endingtime', 0);
  }

  protected startBossFightPhase(): void {
    this.startBossFight();

    this.phase = phases.bossfight;
    this.phase_ending_time = Infinity;

    this.engine.eventBus.publish('game.phase.changed', this.phase);
    this.engine.eventBus.publish('game.phase.endingtime', 0);
  }

  clientConnected(_playerEntity: HellwavePlayer): void {
    if (!this.gameInitialized) {
      this.#initGame();
      this.gameInitialized = true;
    }
  }

  clientDisconnected(playerEntity: HellwavePlayer): void {
    this.checkSquadStatus(playerEntity);
  }

  clientBeing(_playerEntity: HellwavePlayer): void {
    switch (this.phase) {
      case phases.waiting:
        this.startNextRound();
        break;

      case phases.quiet:
        break;

      default:
        break;
    }
  }

  protected checkSquadStatus(skipPlayerEntity: HellwavePlayer | null = null): void {
    let squadTotal = 0;
    let squadStanding = 0;

    for (const clientEdict of this.engine.GetClients()) {
      const player = clientEdict.entity as HellwavePlayer;

      if (skipPlayerEntity !== null && player.equals(skipPlayerEntity)) {
        continue;
      }

      if (player.spectating) {
        continue;
      }

      squadTotal += 1;

      if (player.health > 0) {
        squadStanding += 1;
      }
    }

    (this.game.stats as HellwaveStats).updateSquadStats(squadStanding, squadTotal);

    if (squadTotal <= 0) {
      this.engine.ConsolePrint('no players left in the game, resetting game\n');
      this.resetGame();
      return;
    }

    if (squadStanding <= 0) {
      this.engine.ConsolePrint('no one survived, game over\n');
      this.startGameOverPhase();
      return;
    }

    this.engine.ConsolePrint(`squad still standing with ${squadStanding} of ${squadTotal}\n`);
  }

  #initGame(): void {
    this.closeShops();

    // Prepare the boss victory conditions for the current map
    this.#initBossVictoryConditions();

    // Configure settings that should not be changed midgame
    this.#configureGameSettings();
  }

  protected resetGame(): void {
    const mapname = this.game.mapname!;
    console.assert(mapname !== null, 'resetGame requires an active map name');
    this.engine.ChangeLevel(mapname);
  }
}
