import * as engine from '../../shared/Defs.mjs';
import * as id1 from '../../game/id1/Defs.mjs';

export const solid = engine.solid;
export const moveType = engine.moveType;
export const flags = engine.flags;
export const effect = engine.effect;
export const modelFlags = engine.modelFlags;
export const channel = engine.channel;
export const attn = engine.attn;
export const hull = engine.hull;
export const content = engine.content;

export const range = id1.range;
export const dead = id1.dead;
export const damage = id1.damage;
export const items = id1.items;
export const deathType = id1.deathType;
export const worldType = id1.worldType;
export const tentType = id1.tentType;
export const colors = id1.colors;
export const spawnflags = id1.spawnflags;
export const contentShift = id1.contentShift;

export const clientEventName = id1.clientEventName;

export const clientEvent = Object.assign({}, id1.clientEvent, Object.freeze({
  /** change to the money, args: current balance (number) */
  MONEY_UPDATE: 200,

  /** update on round time, args: seconds of time remaining (number) */
  ROUND_TIME: 201,

  /** update  */
  ROUND_PHASE: 202,

  /** navigation hint */
  NAV_HINT: 203,
}));

