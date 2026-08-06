# Hellwave Events

Events published by the `hellwave` game module (server code under `source/game/hellwave/`)
through `ServerEngineAPI.eventBus`. These are game-published events, not engine-published ones;
see the engine's own [docs/events.md](../../../../docs/events.md) for events the engine itself
publishes, and for the event bus mechanism (buses, lifetimes, subscribe/unsubscribe rules).

| Event | Arguments | Description |
| - | - | - |
| game.phase.changed | 1. phase (Hellwave `phases` enum value) | The round phase changed (quiet/normal/action/game-over). |
| game.phase.endingtime | 1. ending time (game time; `0`/`Infinity` for phases without a countdown) | The current phase's end time changed. Published alongside `game.phase.changed`. |
| game.round.started | 1. round number, 2. round number limit, 3. round monster limit | A new round started. |
