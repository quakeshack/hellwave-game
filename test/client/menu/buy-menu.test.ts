import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { K } from '../../../../../shared/Keys.ts';
import type { PostProcessStack, PostProcessStackOptions } from '../../../../../shared/GameInterfaces.ts';
import { MenuItem } from '../../../../../engine/client/menu/MenuItem.ts';
import { VerticalLayout, type MenuPage } from '../../../../../engine/client/menu/MenuPage.ts';
import { asClientEngineAPI, createMockClientEngine, createMockMenuAPI, type MockClientEngine } from '../../../../id1/test/client/fixtures.ts';
import { createClientdata, createHellwaveGame, type HellwaveClientdata, type HellwaveGameStub } from '../fixtures.ts';
import { itemAt, layoutOf, pressItem } from './fixtures.ts';

await import('../../../../id1/GameAPI.ts');

const { clientEvent, clientEventName, formatMoney, toBuyImpulse } = await import('../../../Defs.ts');
const { buyMenuItems } = await import('../../../entity/Player.ts');
const hudModule = await import('../../../client/HUD.ts');

const HellwaveHUD = hudModule.default;

/**
 * Build the expected buy-menu row label for a catalog entry, matching `HellwaveBuyMenu`'s format.
 * @param impulse Catalog key (1-9).
 * @returns Expected row label.
 */
function expectedBuyRowLabel(impulse: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9): string {
  const item = buyMenuItems[impulse];

  return `[${impulse}] ${formatMoney(item.cost).padStart(5)} - ${item.label}`;
}

/**
 * Create a HUD wired to a real (mock) menu stack, capturing the buy-menu page it registers
 * so tests can drive its rows/customHandleInput/onEscape directly instead of only observing
 * through `engine.Menu.IsOpen()`.
 * @param clientdataOverrides Overrides merged into the initial clientdata.
 * @param engineOverrides Additional overrides merged into the mock engine (besides `Menu`, which this rig owns).
 * @returns Test rig.
 */
function createBuyMenuHud(clientdataOverrides: Partial<HellwaveClientdata> = {}, engineOverrides: Parameters<typeof createMockClientEngine>[0] = {}) {
  const realMenuAPI = createMockMenuAPI();
  let buyMenuPage: MenuPage | null = null;
  const menuAPI = {
    ...realMenuAPI,
    RegisterPage(name: string, page: MenuPage): void {
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
  const hud = new HellwaveHUD(game, asClientEngineAPI(engine));

  // `hw_buymenu` is registered once by the static lifecycle hook (see HUD.ts `Init`), not by
  // instance init -- needed here since the command handler reads the currently-active instance.
  HellwaveHUD.Init(asClientEngineAPI(engine));
  hud.init();

  return {
    engine,
    game,
    hud,
    getBuyMenuPage: (): MenuPage => {
      assert.ok(buyMenuPage, 'the buy menu page is registered');
      return buyMenuPage;
    },
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
    new HellwaveHUD(game, asClientEngineAPI(engine)).init();
    new HellwaveHUD(game, asClientEngineAPI(engine)).init();

    assert.equal(engine.commands.has('hw_buymenu'), false);
  });

  void test('static Init registers it once; Shutdown unregisters it', () => {
    const engine = createMockClientEngine();

    HellwaveHUD.Init(asClientEngineAPI(engine));
    assert.equal(engine.commands.has('hw_buymenu'), true);

    HellwaveHUD.Shutdown(asClientEngineAPI(engine));
    assert.equal(engine.commands.has('hw_buymenu'), false);
  });

  void test('the hw_buymenu handler is a no-op once its HUD instance has been shut down', () => {
    const engine = createMockClientEngine();
    const game = createHellwaveGame(engine, {
      clientdata: createClientdata({ buyzone: 1 }),
    });

    HellwaveHUD.Init(asClientEngineAPI(engine));
    const hud = new HellwaveHUD(game, asClientEngineAPI(engine));
    hud.init();
    hud.shutdown();

    void engine.commands.get('hw_buymenu')?.();

    assert.equal(engine.Menu.IsOpen('hellwave_buy'), false);

    HellwaveHUD.Shutdown(asClientEngineAPI(engine));
  });
});

void describe('buy menu as a real menu page', () => {
  /**
   * Simulate pressing `b` -- triggers the `hw_buymenu` client command the HUD registers,
   * exactly like the real keybind does, with no server round-trip involved.
   * @param engine Mock client engine returned by `createBuyMenuHud`.
   */
  function pressBuyMenuKey(engine: MockClientEngine): void {
    void engine.commands.get('hw_buymenu')?.();
  }

  /**
   * Simulate a synced clientdata field changing: mutates `game.clientdata[field]` before
   * publishing the change event, matching what `ClientMessages.parseClientData` actually does
   * in production (update-then-publish) -- code reading `game.clientdata` directly, like the
   * `hw_buymenu` command, depends on the field already being current by the time it runs.
   * @param game Game returned by `createBuyMenuHud`.
   * @param engine Mock client engine returned by `createBuyMenuHud`.
   * @param field Clientdata field name.
   * @param value New value.
   */
  function publishClientdataChange(game: HellwaveGameStub, engine: MockClientEngine, field: 'buyzone' | 'money', value: number): void {
    // The two fields have different literal types (buyzone is -1, 0 or 1); the event carries plain numbers.
    const clientdata = game.clientdata as unknown as Record<string, number>;
    const previousValue = clientdata[field];
    clientdata[field] = value;
    engine.eventBus.publish('client.clientdata.field-changed', field, value, previousValue);
  }

  void test('opens instantly (no server round-trip) once the server confirms the player is in a buyzone', () => {
    const { engine, game } = createBuyMenuHud({ buyzone: 0, money: 0 });

    pressBuyMenuKey(engine);
    assert.equal(engine.Menu.IsOpen('hellwave_buy'), false); // buyzone still 0, refused

    publishClientdataChange(game, engine, 'buyzone', 1);
    assert.equal(engine.Menu.IsOpen('hellwave_buy'), false); // in the zone, but menu not requested yet

    pressBuyMenuKey(engine);
    assert.equal(engine.Menu.IsOpen('hellwave_buy'), true);
    assert.deepEqual(engine.appendedConsoleText, []); // purely local -- nothing sent to the server
  });

  void test('applies the buy-menu blur/desaturate post-process while open, clears it on close', () => {
    const postProcessSetStacks: Array<PostProcessStack | null> = [];
    const { engine } = createBuyMenuHud({ buyzone: 1, money: 0 }, {
      PostProcess: {
        // the tints of the HUD have channels of their own, this is about the buy menu's
        setStack(stack: PostProcessStack, options?: PostProcessStackOptions): void {
          if (options?.channel === undefined) {
            postProcessSetStacks.push(stack);
          }
        },
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

  void test('refreshes row labels and the balance label, keeping every row visible but disabling what the player cannot yet afford', () => {
    const { engine, getBuyMenuPage } = createBuyMenuHud({ buyzone: 1, money: 0 });

    engine.eventBus.publish('client.clientdata.field-changed', 'money', 150, 0);
    pressBuyMenuKey(engine);

    const page = getBuyMenuPage();
    const moneyLabel = itemAt(page, 1, MenuItem);
    const heavyArmorRow = itemAt(page, 2, MenuItem);
    const shotgunRow = itemAt(page, 3, MenuItem);

    assert.equal(moneyLabel.label, `Balance: ${formatMoney(150)}`);
    assert.equal(heavyArmorRow.visible, true); // costs 100
    assert.equal(heavyArmorRow.enabled, true);
    assert.equal(heavyArmorRow.label, expectedBuyRowLabel(1));
    assert.equal(shotgunRow.visible, true); // costs 200, can't afford yet -- still shown
    assert.equal(shotgunRow.enabled, false);

    engine.eventBus.publish('client.clientdata.field-changed', 'money', 250, 150);

    assert.equal(moneyLabel.label, `Balance: ${formatMoney(250)}`);
    assert.equal(shotgunRow.enabled, true);
    assert.equal(shotgunRow.label, expectedBuyRowLabel(2));
  });

  void test('disables an affordable row whose available() predicate says it is already maxed out', () => {
    const { engine, getBuyMenuPage } = createBuyMenuHud({ buyzone: 1, money: 1000, armorvalue: 200 });

    engine.eventBus.publish('client.clientdata.field-changed', 'money', 1000, 0);
    pressBuyMenuKey(engine);

    const heavyArmorRow = itemAt(getBuyMenuPage(), 2, MenuItem);

    assert.equal(heavyArmorRow.visible, true);
    assert.equal(heavyArmorRow.enabled, false); // affordable, but armor is already at the 200 cap
  });

  void test('activating a row sends its dedicated buy-impulse, never a plain weapon-select impulse', () => {
    const { engine, getBuyMenuPage } = createBuyMenuHud({ buyzone: 1, money: 1000 });

    engine.eventBus.publish('client.clientdata.field-changed', 'money', 1000, 0);
    pressBuyMenuKey(engine);

    pressItem(getBuyMenuPage(), 2);

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
    const layout = layoutOf(page);
    assert.ok(layout instanceof VerticalLayout);
    assert.equal(layout.showCursor, false);

    // Row y-positions: header (y=70) + money label (y=86) -- then item 1 (y=102) and item 2
    // (y=118), each 8 tall plus 8 spacing. The feedback label now sits below the whole list, so
    // it doesn't shift these.
    page.updateHover(100, 104);
    assert.equal(page.cursor, 2); // item 1 (Heavy Armor)

    page.updateHover(100, 120);
    assert.equal(page.cursor, 3); // item 2 (Shotgun / 20 shells)
  });

  void test('shows purchase feedback below the item list and lets it expire after a few seconds', () => {
    const { engine, hud, getBuyMenuPage } = createBuyMenuHud({ buyzone: 1, money: 0 });

    pressBuyMenuKey(engine);

    const page = getBuyMenuPage();
    const feedbackLabel = itemAt(page, -1, MenuItem);

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
    const { engine, getBuyMenuPage } = createBuyMenuHud({ buyzone: 1, money: 2000 });

    engine.eventBus.publish('client.clientdata.field-changed', 'money', 2000, 0);
    pressBuyMenuKey(engine);

    const page = getBuyMenuPage();

    assert.equal(page.handleInput('9'.charCodeAt(0) as K), true);
    assert.deepEqual(engine.appendedConsoleText, [`impulse ${toBuyImpulse(9)}\n`]);

    // Not a digit -- falls through to the default MenuPage handling instead of being
    // swallowed (which returns false here since nothing binds F1).
    assert.equal(page.handleInput(K.F1), false);
    assert.deepEqual(engine.appendedConsoleText, [`impulse ${toBuyImpulse(9)}\n`]);
  });

  void test('customHandleInput consumes the key but sends nothing for a disabled (unaffordable/unbuyable) row', () => {
    const { engine, getBuyMenuPage } = createBuyMenuHud({ buyzone: 1, money: 0 });

    pressBuyMenuKey(engine);

    const page = getBuyMenuPage();

    // Item 9 (Megahealth) costs 1000 -- not affordable with a 0 balance, so its row is disabled.
    assert.equal(page.handleInput('9'.charCodeAt(0) as K), true);
    assert.deepEqual(engine.appendedConsoleText, []);
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
