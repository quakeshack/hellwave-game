import { ClientStats } from '../../../game/id1/client/Sync.mjs';
import { phases } from '../GameManager.mjs';

// NOTE: keep in sync with server HellwaveStats
export class HellwaveStatsInfo extends ClientStats {
  round_total = 0;
  round_current = 0;
  squad_total = 0;
  squad_standing = 0;
  round_monsters_limit = 0;
  /** @type {keyof typeof phases?} */
  phase = null;
  phase_ending_time = 0; // game.time + X, in seconds
};
