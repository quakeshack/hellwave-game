# Hellwave Events

Events published by the `hellwave` game module (server code under `source/game/hellwave/`)
through `ServerEngineAPI.eventBus`, declared in `Events.ts` (`HellwaveServerEvents`, which extends id1's).
These are game-published events, not engine-published ones; see the engine's own [docs/events.md](../../../../docs/events.md) for events the engine itself
publishes, and for the event bus mechanism (buses, lifetimes, subscribe/unsubscribe rules).

| Event | Arguments | Description |
| - | - | - |
| game.phase.changed | 1. phase (Hellwave `phases` enum value) | The round phase changed (quiet/normal/action/game-over). |
| game.phase.endingtime | 1. ending time (game time; `0`/`Infinity` for phases without a countdown) | The current phase's end time changed. Published alongside `game.phase.changed`. |
| game.round.started | 1. round number, 2. round number limit, 3. round monster limit | A new round started. |

## Client events

Hellwave sends client events with opcodes above 200, on top of id1's (see the
[`id1` events](../../id1/docs/events.md#client-events) for those). The client game republishes each as
`client.event-received.<opcode>` on `ClientEngineAPI.eventBus`; the opcodes are the `clientEvent` object in `Defs.ts`
and their arguments are `HellwaveClientEventArguments` in `Events.ts`.

| Event | Arguments | Description |
| - | - | - |
| client.event-received.200 | 1. current balance | `MONEY_UPDATE`: the player's money changed. |
| client.event-received.201 | 1. seconds remaining | `ROUND_TIME`: update on round time. Nothing sends it yet. |
| client.event-received.202 | any | `ROUND_PHASE`: update on round phase. Nothing sends it yet. |
| client.event-received.203 | 1. to n. waypoints (`Vector`) | `NAV_HINT`: a navigation hint, the points of a path to draw. |
| client.event-received.204 | 1. message | `BUY_MESSAGE`: buy menu purchase feedback. |

