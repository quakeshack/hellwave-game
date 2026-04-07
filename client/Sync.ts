import { ClientStats, clientStatSlots, parseNumericStatValue } from '../../id1/client/Sync.ts';

import { phases, type HellwavePhase } from '../Phases.ts';

type ClientStatSlot = (typeof clientStatSlots)[number];

const hellwaveStatSlots = [
  'round_total',
  'round_current',
  'squad_total',
  'squad_standing',
  'round_monsters_limit',
  'phase',
  'phase_ending_time',
] as const;

type HellwaveStatSlot = (typeof hellwaveStatSlots)[number];

/**
 * Check whether a stat slot belongs to the Hellwave client stat table.
 * @returns True when the slot is one of the known Hellwave stat keys.
 */
function isHellwaveStatSlot(slot: string): slot is HellwaveStatSlot {
  return hellwaveStatSlots.includes(slot as HellwaveStatSlot);
}

/**
 * Check whether a stat slot belongs to the id1 client stat table.
 * @returns True when the slot is one of the known id1 stat keys.
 */
function isClientStatSlot(slot: string): slot is ClientStatSlot {
  return clientStatSlots.includes(slot as ClientStatSlot);
}

/**
 * Check whether a value is one of the known Hellwave phase names.
 * @returns True when the value is a valid Hellwave phase.
 */
function isHellwavePhase(value: string): value is HellwavePhase {
  return Object.values(phases).includes(value as HellwavePhase);
}

/**
 * Keeps track of Hellwave-specific game statistics on the client.
 * NOTE: Make sure to keep it in sync with the server HellwaveStats.
 */
export class HellwaveStatsInfo extends ClientStats {
  round_total = 0;
  round_current = 0;
  squad_total = 0;
  squad_standing = 0;
  round_monsters_limit = 0;
  phase: HellwavePhase | null = null;
  phase_ending_time = 0;

  /**
   * Apply id1 and Hellwave stat updates to the combined HUD stat table.
   */
  protected override _setStat(slot: string, value: number | string): void {
    if (isClientStatSlot(slot)) {
      super._setStat(slot, value);
      return;
    }

    if (!isHellwaveStatSlot(slot)) {
      return;
    }

    switch (slot) {
      case 'round_total':
        {
          const numericValue = parseNumericStatValue(value);

          if (numericValue !== null) {
            this.round_total = numericValue;
          }
        }
        break;
      case 'round_current':
        {
          const numericValue = parseNumericStatValue(value);

          if (numericValue !== null) {
            this.round_current = numericValue;
          }
        }
        break;
      case 'squad_total':
        {
          const numericValue = parseNumericStatValue(value);

          if (numericValue !== null) {
            this.squad_total = numericValue;
          }
        }
        break;
      case 'squad_standing':
        {
          const numericValue = parseNumericStatValue(value);

          if (numericValue !== null) {
            this.squad_standing = numericValue;
          }
        }
        break;
      case 'round_monsters_limit':
        {
          const numericValue = parseNumericStatValue(value);

          if (numericValue !== null) {
            this.round_monsters_limit = numericValue;
          }
        }
        break;
      case 'phase':
        if (typeof value === 'string' && isHellwavePhase(value)) {
          this.phase = value;
        }
        break;
      case 'phase_ending_time':
        {
          const numericValue = parseNumericStatValue(value);

          if (numericValue !== null) {
            this.phase_ending_time = numericValue;
          }
        }
        break;
      default:
        break;
    }
  }
}
