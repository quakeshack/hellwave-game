import GameStats from '../../../game/id1/helper/GameStats.ts';
import { clientEvent } from '../Defs.mjs';
import { phases } from '../GameManager.mjs';

// NOTE: keep in sync with server HellwaveStatsInfo
export default class HellwaveStats extends GameStats {
  /** current round number */
  round_current = 0;
  /** total rounds for the current session */
  round_total = 0;
  /** living players currently standing */
  squad_standing = 0;
  /** players expected to be in the squad */
  squad_total = 0;
  /** monster cap for the active round */
  round_monsters_limit = 0;
  /** @type {keyof typeof phases} current game phase */
  phase = phases.waiting;
  /** phase end timestamp in game seconds */
  phase_ending_time = 0;

  reset() {
    super.reset();

    this.round_current = 0;
    this.round_total = 0;
    this.squad_standing = 0;
    this.squad_total = 0;
    this.round_monsters_limit = 0;
    /** @type {keyof typeof phases} */
    this.phase = phases.waiting;
    /** @type {number} */
    this.phase_ending_time = 0; // game.time + X, in seconds
  }

  subscribeToEvents() {
    super.subscribeToEvents();

    this.engine.eventBus.subscribe('game.round.started', (roundNumber, roundTotal, roundMonstersLimit) => {
      this.round_current = /** @type {number} */(roundNumber);
      this.round_total = /** @type {number} */(roundTotal);
      this.round_monsters_limit = /** @type {number} */(roundMonstersLimit);
      this.engine.BroadcastClientEvent(true, clientEvent.STATS_UPDATED, 'round_current', this.round_current);
      this.engine.BroadcastClientEvent(true, clientEvent.STATS_UPDATED, 'round_total', this.round_total);
      this.engine.BroadcastClientEvent(true, clientEvent.STATS_UPDATED, 'round_monsters_limit', this.round_monsters_limit);

      // reset stats
      this.monsters_total = 0;
      this.monsters_killed = 0;

      this.engine.BroadcastClientEvent(true, clientEvent.STATS_UPDATED, 'monsters_total', this.monsters_total);
      this.engine.BroadcastClientEvent(true, clientEvent.STATS_UPDATED, 'monsters_killed', this.monsters_killed);
    });

    this.engine.eventBus.subscribe('game.phase.changed', (newPhase) => {
      const phase = /** @type {keyof typeof phases} */(newPhase);

      if (this.phase !== phase) {
        this.phase = phase;
        this.engine.BroadcastClientEvent(true, clientEvent.STATS_UPDATED, 'phase', this.phase);
      }
    });

    this.engine.eventBus.subscribe('game.phase.endingtime', (newEndingTime) => {
      const endingTime = /** @type {number} */(newEndingTime);

      if (this.phase_ending_time !== endingTime) {
        this.phase_ending_time = endingTime;
        this.engine.BroadcastClientEvent(true, clientEvent.STATS_UPDATED, 'phase_ending_time', this.phase_ending_time);
      }
    });
  }

  /**
   * @param {number} squadStanding
   * @param {number} squadTotal
   * @returns {this} The stats instance for chaining.
   */
  updateSquadStats(squadStanding, squadTotal) {
    if (this.squad_standing !== squadStanding) {
      this.squad_standing = squadStanding;
      this.engine.BroadcastClientEvent(true, clientEvent.STATS_UPDATED, 'squad_standing', this.squad_standing);
    }

    if (this.squad_total !== squadTotal) {
      this.squad_total = squadTotal;
      this.engine.BroadcastClientEvent(true, clientEvent.STATS_UPDATED, 'squad_total', this.squad_total);
    }

    return this;
  }

  /**
   * @param {{ edict: import('../../../shared/GameInterfaces').ServerEdict | null }} playerEntity client player entity
   */
  sendToPlayer(playerEntity) {
    super.sendToPlayer(playerEntity);

    const playerEdict = playerEntity.edict;
    console.assert(playerEdict !== null, 'HellwaveStats.sendToPlayer requires a player edict');
    const targetEdict = /** @type {import('../../../shared/GameInterfaces').ServerEdict} */ (playerEdict);

    this.engine.DispatchClientEvent(targetEdict, true, clientEvent.STATS_INIT, 'round_total', this.round_total);
    this.engine.DispatchClientEvent(targetEdict, true, clientEvent.STATS_INIT, 'round_current', this.round_current);
    this.engine.DispatchClientEvent(targetEdict, true, clientEvent.STATS_INIT, 'squad_standing', this.squad_standing);
    this.engine.DispatchClientEvent(targetEdict, true, clientEvent.STATS_INIT, 'squad_total', this.squad_total);
    this.engine.DispatchClientEvent(targetEdict, true, clientEvent.STATS_INIT, 'phase', this.phase);
    this.engine.DispatchClientEvent(targetEdict, true, clientEvent.STATS_INIT, 'phase_ending_time', this.phase_ending_time);
    this.engine.DispatchClientEvent(targetEdict, true, clientEvent.STATS_INIT, 'round_monsters_limit', this.round_monsters_limit);
  }
};
