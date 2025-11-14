import { cvarFlags } from '../../shared/Defs.mjs';
import { entityClasses as id1EntityClasses, ServerGameAPI as id1ServerGameAPI } from '../id1/GameAPI.mjs';
import EntityRegistry from '../id1/helper/Registry.mjs';
import { BackpackEntity } from './entity/Items.mjs';
import HellwavePlayer from './entity/Player.mjs';
import { WallEntity } from './entity/Props.mjs';
import { BuyZoneEntity, BuyZoneShuttersEntity, MonstersSpawnZoneEntity, PlayersSpawnZoneEntity } from './entity/Zones.mjs';
import GameManager from './GameManager.mjs';
import HellwaveStats from './helper/HellwaveStats.mjs';

/** @typedef {import("../../shared/GameInterfaces").Cvar} Cvar */
/** @typedef {import("../../shared/GameInterfaces").ServerEngineAPI} ServerEngineAPI */

const entityClasses = [].concat(id1EntityClasses, [
  HellwavePlayer,
  BackpackEntity,
  WallEntity,
  BuyZoneEntity,
  BuyZoneShuttersEntity,
  MonstersSpawnZoneEntity,
  PlayersSpawnZoneEntity,
]);

export class ServerGameAPI extends id1ServerGameAPI {
  static _entityRegistry = new EntityRegistry(entityClasses);

  static _cvars = Object.assign({}, id1ServerGameAPI._cvars, {
    rounds: null,
    quiettime: null,
    normaltime: null,
    maxmonstersalive: null,
    debug_spawnpoints: null,
  });

  /**
   * Invoked by spawning a server or a changelevel. It will initialize the global game state.
   * @param {ServerEngineAPI} engineAPI engine exports
   */
  constructor(engineAPI) {
    super(engineAPI);

    this._serializer.startFields();
    this.manager = new GameManager(this);
    this._serializer.endFields();
  }

  _newGameStats() {
    return new HellwaveStats(this, this.engine);
  }

  get rounds() {
    return ServerGameAPI._cvars.rounds.value;
  }

  get quiettime() {
    return ServerGameAPI._cvars.quiettime.value;
  }

  get normaltime() {
    return ServerGameAPI._cvars.normaltime.value;
  }

  get maxmonstersalive() {
    return ServerGameAPI._cvars.maxmonstersalive.value;
  }

  get debug_spawnpoints() {
    return ServerGameAPI._cvars.debug_spawnpoints.value;
  }

  startFrame() {
    super.startFrame();

    this.manager.startFrame();
  }

  ClientConnect(clientEdict) {
    const playerEntity = /** @type {HellwavePlayer} */(clientEdict.entity);
    playerEntity.connected();

    this.manager.clientConnected(playerEntity);
  }

  ClientDisconnect(clientEdict) {
    const playerEntity = /** @type {HellwavePlayer} */(clientEdict.entity);

    this.manager.clientDisconnected(playerEntity);
  }

  ClientBegin(clientEdict) {
    const playerEntity = /** @type {HellwavePlayer} */(clientEdict.entity);

    this.manager.clientBeing(playerEntity);
  }

  /** @param {ServerEngineAPI} ServerEngineAPI engine API for server game code */
  static Init(ServerEngineAPI) {
    id1ServerGameAPI.Init(ServerEngineAPI);

    Object.assign(this._cvars, id1ServerGameAPI._cvars);

    this._cvars.rounds = ServerEngineAPI.RegisterCvar('hw_rounds', '12', 0, 'Number of rounds to play in a map. Must be set before the map starts. 0 = infinite rounds.');
    this._cvars.quiettime = ServerEngineAPI.RegisterCvar('hw_quiet_time', '90', 0, 'Duration of quiet phase in seconds. During quiet phase players can buy items.');
    this._cvars.normaltime = ServerEngineAPI.RegisterCvar('hw_normal_time', '90', 0, 'How many seconds of normal phase before action phase. Set to 0 to disable normal phase.');
    this._cvars.maxmonstersalive = ServerEngineAPI.RegisterCvar('hw_monsters_alive', '20', 0, 'Maximum number of monsters alive at a time per player. 0 = no limit.');
    this._cvars.debug_spawnpoints = ServerEngineAPI.RegisterCvar('hw_debug_spawnpoints', '0', cvarFlags.CHEAT, 'If set to 1, spawn points will be visualized with debug markers.');
  }

  init(mapname, serverflags) {
    super.init(mapname, serverflags);

    // make sure manager is subscribed
    this.manager.subscribeToEvents();

    // set the round limit
    this.manager.round_number_limit = Math.max(1, Math.min(12, ServerGameAPI._cvars.rounds.value));
  }
};
