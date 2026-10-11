import type { ClientEngineAPI, ClientEventValue, ClientGameEventMap, ServerEngineAPI, ServerGameEventMap, TypedEventBus } from '../../shared/GameInterfaces.ts';
import type Vector from '../../shared/Vector.ts';
import type { ClientEventTopics, Id1ClientEventArguments, Id1ServerEvents } from '../id1/Events.ts';
import type { clientEvent } from './Defs.ts';
import type { HellwavePhase } from './Phases.ts';

/**
 * The events the server side of Hellwave publishes on `ServerEngineAPI.eventBus`, on top of the ones of id1 (its code
 * runs in Hellwave too, and Hellwave listens to them). Documented in `docs/events.md` and kept equal to it by
 * `test/events-docs.test.mjs`.
 */
export interface HellwaveServerEvents extends Id1ServerEvents {
  'game.phase.changed': [phase: HellwavePhase];
  'game.phase.endingtime': [endingTime: number];
  'game.round.started': [roundNumber: number, roundNumberLimit: number, roundMonstersLimit: number];
}

/** What the client events of Hellwave carry, keyed by opcode, on top of the ones of id1. */
export interface HellwaveClientEventArguments extends Id1ClientEventArguments {
  [clientEvent.MONEY_UPDATE]: [balance: number];
  [clientEvent.ROUND_TIME]: [secondsRemaining: number];
  /** Nothing sends this yet. */
  [clientEvent.ROUND_PHASE]: ClientEventValue[];
  [clientEvent.NAV_HINT]: [...waypoints: readonly Vector[]];
  [clientEvent.BUY_MESSAGE]: [message: string];
}

/** The events of the client side of Hellwave: id1's, its own opcodes by their topic names, and `hud.showscores`. */
export type HellwaveClientEvents = ClientEventTopics<HellwaveClientEventArguments> & {
  'hud.showscores': [showScoreboard: boolean];
};

/** What Hellwave's server code gets to publish and listen for. */
export type HellwaveServerEventBus = TypedEventBus<ServerGameEventMap & HellwaveServerEvents>;

/** What Hellwave's client code gets to publish and listen for. */
export type HellwaveClientEventBus = TypedEventBus<ClientGameEventMap & HellwaveClientEvents>;

/** Compile-time check that every opcode of `clientEvent` has its arguments declared above or in id1. */
export const everyClientEventHasArguments: [Exclude<(typeof clientEvent)[keyof typeof clientEvent], keyof HellwaveClientEventArguments>] extends [never] ? true : false = true;

/** The names of the events Hellwave adds on the server, for the test that compares them with `docs/events.md`. */
export const hellwaveServerEventNames = Object.freeze([
  'game.phase.changed',
  'game.phase.endingtime',
  'game.round.started',
] as const satisfies ReadonlyArray<Exclude<keyof HellwaveServerEvents, keyof Id1ServerEvents>>);

/**
 * The server game's event bus, with the events of id1 and Hellwave typed. The object is the engine's: this only says
 * what it carries, so a typo in a name or a wrong payload does not compile.
 * @param engine What the server code of the game got from the engine.
 * @returns The same bus the engine API hands out.
 */
export function serverEvents(engine: ServerEngineAPI): HellwaveServerEventBus {
  return engine.eventBus as unknown as HellwaveServerEventBus;
}

/**
 * The client game's event bus, with the events of id1 and Hellwave typed. The object is the engine's: this only says
 * what it carries, so a typo in a name or a wrong payload does not compile.
 * @param engine What the client code of the game got from the engine.
 * @returns The same bus the engine API hands out.
 */
export function clientEvents(engine: ClientEngineAPI): HellwaveClientEventBus {
  return engine.eventBus as unknown as HellwaveClientEventBus;
}
