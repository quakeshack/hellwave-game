import type { Cvar, MapDetails, ServerEdict, ServerEngineAPI, StartServerListEntry } from '../../shared/GameInterfaces.ts';

import { cvarFlags } from '../../shared/Defs.ts';
import { entityClasses as id1EntityClasses, featureFlags, ServerGameAPI as id1ServerGameAPI } from '../id1/GameAPI.ts';
import type { EntityClass } from '../id1/entity/BaseEntity.ts';
import EntityRegistry from '../id1/helper/Registry.ts';
import { entity, serializable } from '../id1/helper/MiscHelpers.ts';
import { HellwaveBackpackEntity, HellwaveHealthItemEntity } from './entity/Items.ts';
import { HellwaveDogMonsterEntity } from './entity/Monsters.ts';
import HellwavePlayer from './entity/Player.ts';
import { WallEntity } from './entity/Props.ts';
import { HellwaveSuperspike } from './entity/Weapons.ts';
import { BuyZoneEntity, BuyZoneShuttersEntity, MonstersSpawnZoneEntity, PlayersSpawnZoneEntity } from './entity/Zones.ts';
import GameManager from './GameManager.ts';
import HellwaveStats from './helper/HellwaveStats.ts';

interface HellwaveCvarMap extends Record<keyof typeof id1ServerGameAPI._cvars, Cvar | null> {
  rounds: Cvar | null;
  quiettime: Cvar | null;
  normaltime: Cvar | null;
  maxmonstersalive: Cvar | null;
  debug_spawnpoints: Cvar | null;
}

// Enable some features that stray from the original vanilla behavior.
featureFlags.push(
  'draw-bullet-hole-decals',
  'correct-ballistic-grenades',
);

const entityClasses = [
  ...id1EntityClasses,
  HellwavePlayer,
  HellwaveBackpackEntity,
  HellwaveHealthItemEntity,
  HellwaveDogMonsterEntity,
  WallEntity,
  BuyZoneEntity,
  BuyZoneShuttersEntity,
  MonstersSpawnZoneEntity,
  PlayersSpawnZoneEntity,
  HellwaveSuperspike,
] satisfies readonly EntityClass[];

/**
 * Require a connected Hellwave player entity.
 * @returns Connected Hellwave player.
 */
function expectHellwavePlayer(clientEdict: ServerEdict): HellwavePlayer {
  const playerEntity = clientEdict.entity;

  if (!(playerEntity instanceof HellwavePlayer)) {
    throw new TypeError('Expected HellwavePlayer entity');
  }

  return playerEntity;
}

@entity
class HellwaveServerGameAPI extends id1ServerGameAPI {
  static _entityRegistry = new EntityRegistry(entityClasses);

  static _cvars: HellwaveCvarMap = {
    ...id1ServerGameAPI._cvars,
    rounds: null,
    quiettime: null,
    normaltime: null,
    maxmonstersalive: null,
    debug_spawnpoints: null,
  };

  /** Hellwave round and spawn manager serialized with the game state. */
  @serializable manager!: GameManager;

  /**
   * Invoked by spawning a server or a changelevel. It will initialize the global game state.
   */
  constructor(engineAPI: ServerEngineAPI) {
    super(engineAPI);
    this.manager = new GameManager(this);
  }

  override _newGameStats(): HellwaveStats {
    return new HellwaveStats(this, this.engine);
  }

  get rounds(): number {
    const rounds = HellwaveServerGameAPI._cvars.rounds;
    return rounds?.value ?? 0;
  }

  get quiettime(): number {
    const quiettime = HellwaveServerGameAPI._cvars.quiettime;
    return quiettime?.value ?? 0;
  }

  get normaltime(): number {
    const normaltime = HellwaveServerGameAPI._cvars.normaltime;
    return normaltime?.value ?? 0;
  }

  get maxmonstersalive(): number {
    const maxmonstersalive = HellwaveServerGameAPI._cvars.maxmonstersalive;
    return maxmonstersalive?.value ?? 0;
  }

  get debug_spawnpoints(): number {
    const debugSpawnPoints = HellwaveServerGameAPI._cvars.debug_spawnpoints;
    return debugSpawnPoints?.value ?? 0;
  }

  override _precacheResources(): void {
    super._precacheResources();

    // We almost spawn all entities dynamically, so force a precache for all relevant classes.
    for (const entityClass of HellwaveServerGameAPI._entityRegistry.getAll()) {
      if (entityClass.classname.startsWith('item_key')) {
        continue;
      }

      if (entityClass.classname.startsWith('monster_')
        || entityClass.classname.startsWith('item_')
        || entityClass.classname.startsWith('weapon_')
      ) {
        new entityClass(null, this).precacheEntity();
      }
    }

    // Some precaches depend on entity configuration, so precache them explicitly here.
    this.engine.PrecacheModel('maps/b_bh100.bsp');
  }

  override startFrame(): void {
    super.startFrame();
    this.manager.startFrame();
  }

  override ClientConnect(clientEdict: ServerEdict): void {
    const playerEntity = expectHellwavePlayer(clientEdict);
    playerEntity.connected();

    this.manager.clientConnected(playerEntity);
  }

  override ClientDisconnect(clientEdict: ServerEdict): void {
    const playerEntity = expectHellwavePlayer(clientEdict);
    playerEntity.disconnected();

    this.manager.clientDisconnected(playerEntity);
  }

  ClientBegin(clientEdict: ServerEdict): void {
    const playerEntity = expectHellwavePlayer(clientEdict);
    this.manager.clientBeing(playerEntity);
  }

  static override Init(serverEngineAPI: ServerEngineAPI): void {
    id1ServerGameAPI.Init(serverEngineAPI);

    Object.assign(this._cvars, id1ServerGameAPI._cvars);

    this._cvars.rounds = serverEngineAPI.RegisterCvar('hw_rounds', '12', 0, 'Number of rounds to play in a map. Must be set before the map starts. 0 = infinite rounds.');
    this._cvars.quiettime = serverEngineAPI.RegisterCvar('hw_quiet_time', '90', 0, 'Duration of quiet phase in seconds. During quiet phase players can buy items.');
    this._cvars.normaltime = serverEngineAPI.RegisterCvar('hw_normal_time', '90', 0, 'How many seconds of normal phase before action phase. Set to 0 to disable normal phase.');
    this._cvars.maxmonstersalive = serverEngineAPI.RegisterCvar('hw_monsters_alive', '20', 0, 'Maximum number of monsters alive at a time per player. 0 = no limit.');
    this._cvars.debug_spawnpoints = serverEngineAPI.RegisterCvar('hw_debug_spawnpoints', '0', cvarFlags.CHEAT, 'If set to 1, spawn points will be visualized with debug markers.');
  }

  /**
   * Initialize the Hellwave server game state for the active map.
   */
  override init(mapname: string, serverflags: number): void {
    super.init(mapname, serverflags);

    // Make sure the round manager is subscribed after a map start or changelevel.
    this.manager.subscribeToEvents();

    this.manager.round_number_limit = Math.max(1, Math.min(12, this.rounds));
  }

  static override GetMapList(): MapDetails[] {
    return [
      { name: 'hw_doom', label: 'Doomed computer station', maxplayers: 4, pictures: [] },
      { name: 'hw_e1m2', label: 'Castle of the damned', maxplayers: 4, pictures: [] },
    ];
  }

  static override GetStartServerList(): StartServerListEntry[] {
    return [
      {
        label: 'Castle of the Damned',
        callback(engineAPI: ServerEngineAPI): void {
          engineAPI.AppendConsoleText(`
          hostname "Hellwave: Castle of the Damned"
          deathmatch 0
          coop 1
          samelevel 1
          maxplayers 4
          map hw_e1m2
        `);
        },
      },
      {
        label: 'Doomed Computer Station',
        callback(engineAPI: ServerEngineAPI): void {
          engineAPI.AppendConsoleText(`
          hostname "Hellwave: Doomed Computer Station"
          deathmatch 0
          coop 1
          samelevel 1
          maxplayers 4
          map hw_doom
        `);
        },
      },
    ];
  }
}

export { HellwaveServerGameAPI as ServerGameAPI };
