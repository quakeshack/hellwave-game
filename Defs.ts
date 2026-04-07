import { clientEvent as id1ClientEvent } from '../id1/Defs.ts';

export {
  attn,
  channel,
  content,
  effect,
  flags,
  hull,
  modelFlags,
  moveType,
  solid,
} from '../../shared/Defs.ts';

export {
  clientEventName,
  colors,
  contentShift,
  damage,
  dead,
  deathType,
  items,
  range,
  spawnflags,
  tentType,
  worldType,
} from '../id1/Defs.ts';

/**
 * Client event opcodes emitted by Hellwave game code.
 */
export const clientEvent = Object.freeze({
  ...id1ClientEvent,

  /** change to the money, args: current balance (number) */
  MONEY_UPDATE: 200,

  /** update on round time, args: seconds of time remaining (number) */
  ROUND_TIME: 201,

  /** update on round phase */
  ROUND_PHASE: 202,

  /** navigation hint */
  NAV_HINT: 203,
});

/**
 * Format a balance using the Hellwave currency prefix.
 * @returns Money formatted for HUD rendering.
 */
export function formatMoney(amount: number): string {
  return `Q${amount.toFixed(0)}`;
}
