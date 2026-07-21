import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createMockClientEngine } from '../../../id1/test/client/fixtures.ts';
import { createClientdata, createHellwaveGame } from './fixtures.mjs';

await import('../../../id1/GameAPI.ts');

const { clientEvent, clientEventName } = await import('../../Defs.ts');
const { phases } = await import('../../Phases.ts');
const hudModule = await import('../../client/HUD.ts');

const HellwaveHUD = hudModule.default;

void describe('Hellwave HUD', () => {
  void test('reuses the inherited stats getter for Hellwave-specific stats', () => {
    const engine = createMockClientEngine();
    const game = createHellwaveGame(engine);
    const hud = new HellwaveHUD(game, engine);

    hud.init();

    engine.eventBus.publish(clientEventName(clientEvent.STATS_UPDATED), 'round_total', 6);
    engine.eventBus.publish(clientEventName(clientEvent.STATS_UPDATED), 'phase', phases.quiet);

    assert.equal(hud.stats.round_total, 6);
    assert.equal(hud.stats.phase, phases.quiet);
  });

  void test('plays phase sounds, updates money, and shows the spectator status message', () => {
    const originalRandom = Math.random;
    const engine = createMockClientEngine();
    Math.random = () => 0.0;

    try {
      HellwaveHUD.Init(engine);
      const game = createHellwaveGame(engine, {
        clientdata: createClientdata({ spectating: true }),
      });
      const hud = new HellwaveHUD(game, engine);

      hud.init();

      engine.eventBus.publish(clientEventName(clientEvent.STATS_UPDATED), 'phase', phases.normal);
      engine.eventBus.publish(clientEventName(clientEvent.MONEY_UPDATE), 250);

      hud.draw();

      assert.equal(game.sfx.phase.normal[0].playCount, 1);
      assert.deepEqual(hud.inventory.money, [250, null, 0]);
      assert.deepEqual(engine.contentShifts.length, 1);
      assert.ok(engine.drawStrings.some(({ text }) => text === 'Spectating... Waiting for next round'));
    } finally {
      HellwaveHUD.Shutdown(engine);
      Math.random = originalRandom;
    }
  });

  void test('reacts to a money clientdata field-change event', () => {
    const engine = createMockClientEngine();
    const game = createHellwaveGame(engine, {
      clientdata: createClientdata({ buyzone: 0, money: 0 }),
    });
    const hud = new HellwaveHUD(game, engine);

    hud.init();

    engine.eventBus.publish('client.clientdata.field-changed', 'money', 400, 250);

    assert.deepEqual(hud.inventory.money, [400, null, 0]);
  });

  void test('+showscores/-showscores (inherited from Q1HUD) still toggle the scoreboard on a HellwaveHUD instance', () => {
    const engine = createMockClientEngine();

    // Regression test: the `+showscores`/`-showscores` commands registered by `Q1HUD.Init`
    // publish a `hud.showscores` event on the shared event bus rather than writing to a static
    // class field, so any live HUD instance -- including a `HellwaveHUD` -- picks up the toggle
    // through its own `hud.showscores` subscription.
    HellwaveHUD.Init(engine);

    try {
      const game = createHellwaveGame(engine);
      const hud = new HellwaveHUD(game, engine);

      hud.init();

      engine.drawPics.length = 0;
      hud.draw();
      assert.equal(engine.drawPics.some(({ pic }) => pic.name === 'SCOREBAR'), false);

      void engine.commands.get('+showscores')();
      engine.drawPics.length = 0;
      hud.draw();
      assert.equal(engine.drawPics.some(({ pic }) => pic.name === 'SCOREBAR'), true);

      void engine.commands.get('-showscores')();
      engine.drawPics.length = 0;
      hud.draw();
      assert.equal(engine.drawPics.some(({ pic }) => pic.name === 'SCOREBAR'), false);
    } finally {
      HellwaveHUD.Shutdown(engine);
    }
  });
});
