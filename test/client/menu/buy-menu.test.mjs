import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { K } from '../../../../../shared/Keys.ts';
import { createMockClientEngine, createMockMenuAPI } from '../../../../id1/test/client/fixtures.ts';
import { createClientdata, createHellwaveGame } from '../fixtures.mjs';

await import('../../../../id1/GameAPI.ts');

const { clientEvent, clientEventName, formatMoney, toBuyImpulse } = await import('../../../Defs.ts');
const { buyMenuItems } = await import('../../../entity/Player.ts');
const hudModule = await import('../../../client/HUD.ts');

const HellwaveHUD = hudModule.default;

/**
 * Build the expected buy-menu row label for a catalog entry, matching `HellwaveBuyMenu`'s format.
 * @param {number} impulse Catalog key (1-9).
 * @returns {string} Expected row label.
 */
function expectedBuyRowLabel(impulse) {
  const item = buyMenuItems[impulse];

  return `[${impulse}] ${formatMoney(item.cost).padStart(5)} - ${item.label}`;
}

/**
 * Create a HUD wired to a real (mock) menu stack, capturing the buy-menu page it registers
 * so tests can drive its rows/customHandleInput/onEscape directly instead of only observing
 * through `engine.Menu.IsOpen()`.
 * @param {object} clientdataOverrides Overrides merged into the initial clientdata.
 * @param {object} engineOverrides Additional overrides merged into the mock engine (besides `Menu`, which this rig owns).
 * @returns {{ engine: object, hud: object, getBuyMenuPage: () => object }} Test rig.
 */
function createBuyMenuHud(clientdataOverrides = {}, engineOverrides = {}) {
  const realMenuAPI = createMockMenuAPI();
  let buyMenuPage = null;
  const menuAPI = {
    ...realMenuAPI,
    RegisterPage(name, page) {
      if (name === 'hellwave_buy') {
        buyMenuPage = page;
      }
      realMenuAPI.RegisterPage(name, page);
    },
  };

  const engine = createMockClientEngine({ ...engineOverrides, Menu: menuAPI });
  const game = createHellwaveGame(engine, {
    clientdata: createClientdata(clientdataOverrides),
  });
  const hud = new HellwaveHUD(game, engine);

  // `hw_buymenu` is registered once by the static lifecycle hook (see HUD.ts `Init`), not by
  // instance init -- needed here since the command handler reads the currently-active instance.
  HellwaveHUD.Init(engine);
  hud.init();

  return {
    engine,
    hud,
    getBuyMenuPage: () => buyMenuPage,
  };
}

void describe('hw_buymenu command registration', () => {
  void test('is not registered by per-instance init -- only by the static Init lifecycle hook', () => {
    const engine = createMockClientEngine();
    const game = createHellwaveGame(engine);

    // Simulates two map loads sharing one client engine, since a fresh `HellwaveHUD` is
    // constructed on every map load (see `ClientGameAPI`). Before this fix, `hw_buymenu` was
    // registered from instance init, so the second `hud.init()` here would hit
    // `Cmd.AddCommand`'s "already exists" assert.
    new HellwaveHUD(game, engine).init();
    new HellwaveHUD(game, engine).init();

    assert.equal(engine.commands.has('hw_buymenu'), false);
  });

  void test('static Init registers it once; Shutdown unregisters it', () => {
    const engine = createMockClientEngine();

    HellwaveHUD.Init(engine);
    assert.equal(engine.commands.has('hw_buymenu'), true);

    HellwaveHUD.Shutdown(engine);
    assert.equal(engine.commands.has('hw_buymenu'), false);
  });

  void test('the hw_buymenu handler is a no-op once its HUD instance has been shut down', () => {
    const engine = createMockClientEngine();
    const game = createHellwaveGame(engine, {
      clientdata: createClientdata({ buyzone: 1 }),
    });

    HellwaveHUD.Init(engine);
    const hud = new HellwaveHUD(game, engine);
    hud.init();
    hud.shutdown();

    void engine.commands.get('hw_buymenu')();

    assert.equal(engine.Menu.IsOpen('hellwave_buy'), false);

    HellwaveHUD.Shutdown(engine);
  });
});

void describe('buy menu as a real menu page', () => {
  /**
   * Simulate pressing `b` -- triggers the `hw_buymenu` client command the HUD registers,
   * exactly like the real keybind does, with no server round-trip involved.
   * @param {object} engine Mock client engine returned by `createBuyMenuHud`.
   */
  function pressBuyMenuKey(engine) {
    engine.commands.get('hw_buymenu')();
  }

  /**
   * Simulate a synced clientdata field changing: mutates `game.clientdata[field]` before
   * publishing the change event, matching what `ClientMessages.parseClientData` actually does
   * in production (update-then-publish) -- code reading `game.clientdata` directly, like the
   * `hw_buymenu` command, depends on the field already being current by the time it runs.
   * @param {object} hud HUD instance returned by `createBuyMenuHud`.
   * @param {object} engine Mock client engine returned by `createBuyMenuHud`.
   * @param {string} field Clientdata field name.
   * @param {number} value New value.
   */
  function publishClientdataChange(hud, engine, field, value) {
    const previousValue = hud.game.clientdata[field];
    hud.game.clientdata[field] = value;
    engine.eventBus.publish('client.clientdata.field-changed', field, value, previousValue);
  }

  void test('opens instantly (no server round-trip) once the server confirms the player is in a buyzone', () => {
    const { engine, hud } = createBuyMenuHud({ buyzone: 0, money: 0 });

    pressBuyMenuKey(engine);
    assert.equal(engine.Menu.IsOpen('hellwave_buy'), false); // buyzone still 0, refused

    publishClientdataChange(hud, engine, 'buyzone', 1);
    assert.equal(engine.Menu.IsOpen('hellwave_buy'), false); // in the zone, but menu not requested yet

    pressBuyMenuKey(engine);
    assert.equal(engine.Menu.IsOpen('hellwave_buy'), true);
    assert.deepEqual(engine.appendedConsoleText, []); // purely local -- nothing sent to the server
  });

  void test('applies the buy-menu blur/desaturate post-process while open, clears it on close', () => {
    const postProcessSetStacks = [];
    const { engine } = createBuyMenuHud({ buyzone: 1, money: 0 }, {
      PostProcess: {
        setStack(stack) { postProcessSetStacks.push(stack); },
        clearStack() { postProcessSetStacks.push(null); },
        hasStack() { return postProcessSetStacks.at(-1) !== null; },
      },
    });

    pressBuyMenuKey(engine);
    assert.equal(postProcessSetStacks.length, 1);
    assert.notEqual(postProcessSetStacks[0], null);

    engine.Menu.Pop();
    assert.equal(postProcessSetStacks.length, 2);
    assert.equal(postProcessSetStacks[1], null);
  });

  void test('closes involuntarily when the server says we left the zone, without waiting for Escape/b', () => {
    const { engine } = createBuyMenuHud({ buyzone: 1, money: 0 });

    pressBuyMenuKey(engine);
    assert.equal(engine.Menu.IsOpen('hellwave_buy'), true);

    // Round timer ran out / player forced out of the zone -- not an explicit Escape/b press.
    engine.eventBus.publish('client.clientdata.field-changed', 'buyzone', -1, 1);
    assert.equal(engine.Menu.IsOpen('hellwave_buy'), false);
  });

  void test('refreshes row labels, the balance label, and hides items the player cannot afford, on open and on money changes', () => {
    const { engine, getBuyMenuPage } = createBuyMenuHud({ buyzone: 1, money: 0 });

    engine.eventBus.publish('client.clientdata.field-changed', 'money', 150, 0);
    pressBuyMenuKey(engine);

    const page = getBuyMenuPage();
    const [, moneyLabel, , heavyArmorRow, shotgunRow] = page.items;

    assert.equal(moneyLabel.label, `Balance: ${formatMoney(150)}`);
    assert.equal(heavyArmorRow.visible, true); // costs 100
    assert.equal(heavyArmorRow.label, expectedBuyRowLabel(1));
    assert.equal(shotgunRow.visible, false); // costs 200, can't afford yet

    engine.eventBus.publish('client.clientdata.field-changed', 'money', 250, 150);

    assert.equal(moneyLabel.label, `Balance: ${formatMoney(250)}`);
    assert.equal(shotgunRow.visible, true);
    assert.equal(shotgunRow.label, expectedBuyRowLabel(2));
  });

  void test('activating a row sends its dedicated buy-impulse, never a plain weapon-select impulse', () => {
    const { engine, getBuyMenuPage } = createBuyMenuHud({ buyzone: 1, money: 1000 });

    engine.eventBus.publish('client.clientdata.field-changed', 'money', 1000, 0);
    pressBuyMenuKey(engine);

    const heavyArmorRow = getBuyMenuPage().items[3];
    heavyArmorRow.action();

    assert.deepEqual(engine.appendedConsoleText, [`impulse ${toBuyImpulse(1)}\n`]);
  });

  void test('hovering the mouse over a row moves the focus cursor to it, like every other menu', () => {
    const { engine, getBuyMenuPage } = createBuyMenuHud({ buyzone: 1, money: 1000 });

    engine.eventBus.publish('client.clientdata.field-changed', 'money', 1000, 0);
    pressBuyMenuKey(engine);

    const page = getBuyMenuPage();

    // The built-in blinking cursor is disabled here on purpose (see the next test) -- hover
    // still tracks `page.cursor` the normal way regardless, since that's `VerticalLayout.hitTest`,
    // unrelated to whether it also draws its own cursor glyph.
    assert.equal(page.layout.showCursor, false);

    // Row y-positions: header (y=40) + money label (y=52) -- the feedback label is invisible
    // by default and consumes no space -- then item 1 (y=64) and item 2 (y=76), each 8 tall.
    page.updateHover(100, 66);
    assert.equal(page.cursor, 3); // item 1 (Heavy Armor)

    page.updateHover(100, 78);
    assert.equal(page.cursor, 4); // item 2 (Shotgun / 20 shells)
  });

  void test('shows purchase feedback and lets it expire after a few seconds', () => {
    const { engine, hud, getBuyMenuPage } = createBuyMenuHud({ buyzone: 1, money: 0 });

    pressBuyMenuKey(engine);

    const feedbackLabel = getBuyMenuPage().items[2];

    assert.equal(feedbackLabel.visible, false);

    engine.eventBus.publish(clientEventName(clientEvent.BUY_MESSAGE), 'bought Heavy Armor!');

    assert.equal(feedbackLabel.visible, true);
    assert.equal(feedbackLabel.label, 'bought Heavy Armor!');

    hud.draw(); // still within the expiry window
    assert.equal(feedbackLabel.visible, true);

    engine.CL.gametime += 10;
    hud.draw();
    assert.equal(feedbackLabel.visible, false);
  });

  void test('customHandleInput routes 1-9 to their dedicated buy-impulse and falls back to default navigation otherwise', () => {
    const { engine, getBuyMenuPage } = createBuyMenuHud({ buyzone: 1, money: 0 });

    pressBuyMenuKey(engine);

    const page = getBuyMenuPage();

    assert.equal(page.handleInput('9'.charCodeAt(0)), true);
    assert.deepEqual(engine.appendedConsoleText, [`impulse ${toBuyImpulse(9)}\n`]);

    // Not a digit -- falls through to the default MenuPage handling instead of being
    // swallowed (which returns false here since nothing binds F1).
    assert.equal(page.handleInput(K.F1), false);
    assert.deepEqual(engine.appendedConsoleText, [`impulse ${toBuyImpulse(9)}\n`]);
  });

  void test('Escape closes immediately and purely locally -- nothing is sent to the server', () => {
    const { engine, getBuyMenuPage } = createBuyMenuHud({ buyzone: 1, money: 0 });

    pressBuyMenuKey(engine);
    assert.equal(engine.Menu.IsOpen('hellwave_buy'), true);

    getBuyMenuPage().handleInput(K.ESCAPE);

    assert.deepEqual(engine.appendedConsoleText, []);
    assert.equal(engine.Menu.IsOpen('hellwave_buy'), false);
  });
});
