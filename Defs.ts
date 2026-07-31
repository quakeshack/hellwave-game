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

  /** buy menu purchase feedback, args: message (string) */
  BUY_MESSAGE: 204,
});

/**
 * Format a balance using the Hellwave currency prefix.
 * @returns Money formatted for HUD rendering.
 */
export function formatMoney(amount: number): string {
  return `Q${amount.toFixed(0)}`;
}

/**
 * Impulse numbers 1-9 are id1's weapon-select range; buy-menu purchases live in their own range
 * above it so a purchase can never be misinterpreted as a weapon switch (or vice versa) and the
 * server doesn't need to know whether the client's buy-menu UI happens to be open to tell them
 * apart -- it only needs to know whether the impulse it received is a purchase at all.
 */
const BUY_IMPULSE_BASE = 110;

/**
 * Wire-level impulse number for buying catalog item `itemId`.
 * @returns The impulse number to send.
 */
export function toBuyImpulse(itemId: number): number {
  return BUY_IMPULSE_BASE + itemId;
}

/**
 * Reverse of `toBuyImpulse` -- resolves a raw impulse number back to a catalog item id (1-9), or
 * null if it's not in the buy-menu range.
 * @returns The catalog item id, or null.
 */
export function fromBuyImpulse(impulse: number): number | null {
  const itemId = impulse - BUY_IMPULSE_BASE;

  return itemId >= 1 && itemId <= 9 ? itemId : null;
}
