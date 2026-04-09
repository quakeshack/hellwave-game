import type { GameStatsRecipient } from '../../id1/helper/GameStats.ts';

import GameStats from '../../id1/helper/GameStats.ts';
import { entity, serializable } from '../../id1/helper/MiscHelpers.ts';

import { clientEvent } from '../Defs.ts';
import { phases, type HellwavePhase } from '../Phases.ts';

/**
 * Tracks Hellwave-specific round and squad state and mirrors it to clients.
 * Keep the client-side sync code aligned with these slots.
 */
@entity
export default class HellwaveStats extends GameStats {
  @serializable round_current = 0;
  @serializable round_total = 0;
  @serializable squad_standing = 0;
  @serializable squad_total = 0;
  @serializable round_monsters_limit = 0;
  @serializable phase: HellwavePhase = phases.waiting;
  @serializable phase_ending_time = 0;

  override reset(): void {
    super.reset();

    this.round_current = 0;
    this.round_total = 0;
    this.squad_standing = 0;
    this.squad_total = 0;
    this.round_monsters_limit = 0;
    this.phase = phases.waiting;
    this.phase_ending_time = 0;
  }

  override subscribeToEvents(): void {
    super.subscribeToEvents();

    this.engine.eventBus.subscribe('game.round.started', (roundNumber: number, roundTotal: number, roundMonstersLimit: number): void => {
      this.round_current = roundNumber;
      this.round_total = roundTotal;
      this.round_monsters_limit = roundMonstersLimit;
      this.engine.BroadcastClientEvent(true, clientEvent.STATS_UPDATED, 'round_current', this.round_current);
      this.engine.BroadcastClientEvent(true, clientEvent.STATS_UPDATED, 'round_total', this.round_total);
      this.engine.BroadcastClientEvent(true, clientEvent.STATS_UPDATED, 'round_monsters_limit', this.round_monsters_limit);

      this.monsters_total = 0;
      this.monsters_killed = 0;

      this.engine.BroadcastClientEvent(true, clientEvent.STATS_UPDATED, 'monsters_total', this.monsters_total);
      this.engine.BroadcastClientEvent(true, clientEvent.STATS_UPDATED, 'monsters_killed', this.monsters_killed);
    });

    this.engine.eventBus.subscribe('game.phase.changed', (newPhase: HellwavePhase): void => {
      if (this.phase !== newPhase) {
        this.phase = newPhase;
        this.engine.BroadcastClientEvent(true, clientEvent.STATS_UPDATED, 'phase', this.phase);
      }
    });

    this.engine.eventBus.subscribe('game.phase.endingtime', (newEndingTime: number): void => {
      if (this.phase_ending_time !== newEndingTime) {
        this.phase_ending_time = newEndingTime;
        this.engine.BroadcastClientEvent(true, clientEvent.STATS_UPDATED, 'phase_ending_time', this.phase_ending_time);
      }
    });
  }

  updateSquadStats(squadStanding: number, squadTotal: number): this {
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

  override sendToPlayer(playerEntity: GameStatsRecipient): void {
    super.sendToPlayer(playerEntity);

    console.assert(playerEntity.edict !== null, 'HellwaveStats.sendToPlayer requires a player edict');
    const targetEdict = playerEntity.edict!;

    this.engine.DispatchClientEvent(targetEdict, true, clientEvent.STATS_INIT, 'round_total', this.round_total);
    this.engine.DispatchClientEvent(targetEdict, true, clientEvent.STATS_INIT, 'round_current', this.round_current);
    this.engine.DispatchClientEvent(targetEdict, true, clientEvent.STATS_INIT, 'squad_standing', this.squad_standing);
    this.engine.DispatchClientEvent(targetEdict, true, clientEvent.STATS_INIT, 'squad_total', this.squad_total);
    this.engine.DispatchClientEvent(targetEdict, true, clientEvent.STATS_INIT, 'phase', this.phase);
    this.engine.DispatchClientEvent(targetEdict, true, clientEvent.STATS_INIT, 'phase_ending_time', this.phase_ending_time);
    this.engine.DispatchClientEvent(targetEdict, true, clientEvent.STATS_INIT, 'round_monsters_limit', this.round_monsters_limit);
  }
}
