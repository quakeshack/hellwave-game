import GameStats from '../../../game/id1/helper/GameStats.mjs';
import { clientEvent } from '../Defs.mjs';
import HellwavePlayer from '../entity/Player.mjs';
import { phases } from '../GameManager.mjs';

// NOTE: keep in sync with server HellwaveStatsInfo
export default class HellwaveStats extends GameStats {
  reset() {
    super.reset();

    this.round_current = 0;
    this.round_total = 0;
    this.squad_standing = 0;
    this.squad_total = 0;
    this.round_monsters_limit = 0;
    /** @type {keyof typeof phases} */
    this.phase = phases.waiting;
    this.phase_ending_time = 0; // game.time + X, in seconds
  }

  subscribeToEvents() {
    super.subscribeToEvents();

    this.engine.eventBus.subscribe('game.round.started', (roundNumber, roundTotal, roundMonstersLimit) => {
      this.round_current = roundNumber;
      this.round_total = roundTotal;
      this.round_monsters_limit = roundMonstersLimit;
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
      if (this.phase !== newPhase) {
        this.phase = newPhase;
        this.engine.BroadcastClientEvent(true, clientEvent.STATS_UPDATED, 'phase', this.phase);
      }
    });

    this.engine.eventBus.subscribe('game.phase.endingtime', (newEndingTime) => {
      if (this.phase_ending_time !== newEndingTime) {
        this.phase_ending_time = newEndingTime;
        this.engine.BroadcastClientEvent(true, clientEvent.STATS_UPDATED, 'phase_ending_time', this.phase_ending_time);
      }
    });
  }

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
   * @param {HellwavePlayer} playerEntity client player entity
   */
  sendToPlayer(playerEntity) {
    super.sendToPlayer(playerEntity);

    this.engine.DispatchClientEvent(playerEntity.edict, true, clientEvent.STATS_INIT, 'round_total', this.round_total);
    this.engine.DispatchClientEvent(playerEntity.edict, true, clientEvent.STATS_INIT, 'round_current', this.round_current);
    this.engine.DispatchClientEvent(playerEntity.edict, true, clientEvent.STATS_INIT, 'squad_standing', this.squad_standing);
    this.engine.DispatchClientEvent(playerEntity.edict, true, clientEvent.STATS_INIT, 'squad_total', this.squad_total);
    this.engine.DispatchClientEvent(playerEntity.edict, true, clientEvent.STATS_INIT, 'phase', this.phase);
    this.engine.DispatchClientEvent(playerEntity.edict, true, clientEvent.STATS_INIT, 'phase_ending_time', this.phase_ending_time);
    this.engine.DispatchClientEvent(playerEntity.edict, true, clientEvent.STATS_INIT, 'round_monsters_limit', this.round_monsters_limit);
  }
};
