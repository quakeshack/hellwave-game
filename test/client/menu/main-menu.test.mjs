import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { K } from '../../../../../shared/Keys.ts';
import { createMainMenuRig, createMockSessionsChannel } from './fixtures.mjs';

await import('../../../../id1/GameAPI.ts');

const { default: HellwaveMenu } = await import('../../../client/menu/Menu.ts');

void describe('Hellwave main menu', () => {
  // `Action.handleInput(K.ENTER)`/`MenuPage._moveCursor` (arrow keys) play a nav/confirm sound
  // through the real `S`/`M` registry singletons, which this lightweight mock doesn't set up --
  // same constraint the buy-menu tests work around. Row actions are invoked directly
  // (`page.items[i].action()`) instead of through `page.handleInput(K.ENTER)`, and focus/hit-
  // testing is exercised through `updateHover()`/`layout.hitTest()` directly instead of arrow-key
  // `handleInput()` calls -- neither of those touches sound.

  void test('registers \'main\' with New Game, Profile, Options, and Quit, all enabled', () => {
    const { getMainPage } = createMainMenuRig(HellwaveMenu);
    const page = getMainPage();

    assert.deepEqual(page.items.map((item) => item.label), ['New Game', 'Profile', 'Options', 'Quit']);
    assert.deepEqual(page.items.map((item) => item.enabled), [true, true, true, true]);
  });

  void test('attaches the header bitmap font to every sidebar item once it finishes loading', async () => {
    const { getMainPage } = createMainMenuRig(HellwaveMenu);
    const page = getMainPage();

    assert.deepEqual(page.items.map((item) => item.font), [null, null, null, null]);

    await Promise.resolve(); // flush LoadBitmapFont's promise

    for (const item of page.items) {
      assert.equal(item.font.charset, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    }
  });

  void test('New Game opens the profile gate first when no profile has been confirmed yet', () => {
    const { calls, getMainPage, getProfilePage } = createMainMenuRig(HellwaveMenu);

    getMainPage().items[0].action();

    assert.deepEqual(calls.push, ['hellwave_profile']);
    assert.equal(calls.forceClose, 0);
    assert.equal(getProfilePage().items.at(-1).label, 'Continue'); // gate-specific CTA label
  });

  void test('New Game opens the map picker immediately once a profile has already been confirmed', () => {
    const { engine, calls, getMainPage } = createMainMenuRig(HellwaveMenu);
    engine.SetCvar('hw_profile_confirmed', '1');

    getMainPage().items[0].action();

    assert.deepEqual(calls.push, ['hellwave_newgame']);
    assert.deepEqual(engine.appendedConsoleText, []);
    assert.equal(calls.forceClose, 0);
  });

  void test('accepting the profile gate confirms the profile and then opens the map picker', () => {
    const { engine, calls, getMainPage, getProfilePage } = createMainMenuRig(HellwaveMenu);

    getMainPage().items[0].action(); // opens the gate, Continue label
    getProfilePage().items.at(-1).action(); // accept

    assert.equal(engine.GetCvar('hw_profile_confirmed').string, '1');
    assert.deepEqual(calls.push, ['hellwave_profile', 'hellwave_newgame']);
  });

  void test('Options and Quit push the inherited id1 pages', () => {
    const { calls, getMainPage } = createMainMenuRig(HellwaveMenu);
    const page = getMainPage();

    page.items[2].action();
    page.items[3].action();

    assert.deepEqual(calls.push, ['options', 'quit']);
  });

  void test('hovering the mouse moves focus to the row under the pointer', () => {
    const { getMainPage } = createMainMenuRig(HellwaveMenu);
    const page = getMainPage();

    // Row y-positions: New Game (y=100), Profile (y=128), Options (y=156), Quit (y=184), each 28 tall.
    // This is what actually fixes the "hover doesn't move the cursor on the main menu" bug -- the
    // previous implementation had no real `layout`/`items` for `updateHover()` to resolve against.
    page.updateHover(60, 165);
    assert.equal(page.cursor, 2); // Options

    page.updateHover(60, 135);
    assert.equal(page.cursor, 1); // Profile

    page.updateHover(60, 190);
    assert.equal(page.cursor, 3); // Quit
  });

  void test('layout.hitTest resolves sidebar rows within their own column and ignores the empty session column', () => {
    const { getMainPage } = createMainMenuRig(HellwaveMenu);
    const page = getMainPage();

    assert.equal(page.layout.hitTest(page.items, 60, 100), 0); // New Game
    assert.equal(page.layout.hitTest(page.items, 60, 190), 3); // Quit
    assert.equal(page.layout.hitTest(page.items, 250, 100), null); // session column, nothing there yet
    assert.equal(page.layout.hitTest(page.items, 60, 900), null); // below every row
  });

  void test('Escape closes the menu', () => {
    const { engine, getMainPage } = createMainMenuRig(HellwaveMenu);
    const page = getMainPage();

    engine.Menu.Push('main');
    assert.equal(engine.Menu.IsOpen('main'), true);

    page.handleInput(K.ESCAPE);

    assert.equal(engine.Menu.IsOpen(), false);
  });
});

void describe('Hellwave live session list', () => {
  void test('onEnter subscribes and shows one row per session', () => {
    // hw_doom carries round settings, hw_e1m2 has none -- covers both branches of the round
    // line's presence check without needing a dedicated test (row content only differs in
    // what layout.draw() prints, which isn't observable through .label, see the file-level
    // comment on the map-fallback test below for why draw-level assertions aren't used here).
    const channel = createMockSessionsChannel([
      { sessionId: 'abc', hostname: 'Alice\'s Server', map: 'hw_doom', currentPlayers: 2, maxPlayers: 4, settings: { hw_rounds: '12', hw_round_current: '3' } },
      { sessionId: 'def', hostname: 'Bob\'s Server', map: 'hw_e1m2', currentPlayers: 1, maxPlayers: 4, settings: {} },
    ]);
    const { engine, getMainPage } = createMainMenuRig(HellwaveMenu, {
      Multiplayer: { SubscribeSessions: channel.SubscribeSessions },
    });

    engine.Menu.Push('main');

    assert.deepEqual(getMainPage().items.slice(4).map((item) => item.label), [
      'Doomed computer station [2/4] --',
      'Castle of the damned [1/4] --',
    ]);

    engine.Menu.Pop();
  });

  void test('shows "No active games." when the list is empty', () => {
    const { engine, getMainPage } = createMainMenuRig(HellwaveMenu); // default mock delivers []

    engine.Menu.Push('main');

    assert.deepEqual(getMainPage().items.slice(4).map((item) => item.label), ['No active games.']);

    engine.Menu.Pop();
  });

  void test('shows "Game lobby error." when the channel reports reconnecting', () => {
    const { engine, getMainPage } = createMainMenuRig(HellwaveMenu, {
      Multiplayer: {
        SubscribeSessions: (_onSessions, onStatus) => {
          onStatus?.('reconnecting');
          return () => {};
        },
      },
    });

    engine.Menu.Push('main');

    assert.deepEqual(getMainPage().items.slice(4).map((item) => item.label), ['Game lobby error.']);

    engine.Menu.Pop();
  });

  void test('joining a session connects and closes the menu once a profile is confirmed', () => {
    const channel = createMockSessionsChannel([{ sessionId: 'abc', hostname: 'Alice\'s Server', map: 'hw_doom', currentPlayers: 1, maxPlayers: 4, settings: {} }]);
    const { engine, getMainPage } = createMainMenuRig(HellwaveMenu, {
      Multiplayer: { SubscribeSessions: channel.SubscribeSessions },
    });
    engine.SetCvar('hw_profile_confirmed', '1');

    engine.Menu.Push('main');

    getMainPage().items[4].action();

    assert.deepEqual(engine.appendedConsoleText, ['connect webrtc://abc\n']);
    assert.equal(engine.Menu.IsOpen(), false); // Menu.Close(), same as id1's launch_server join
  });

  void test('joining a session opens the profile gate first when unconfirmed, and accepting connects', () => {
    const channel = createMockSessionsChannel([{ sessionId: 'abc', hostname: 'Alice\'s Server', map: 'hw_doom', currentPlayers: 1, maxPlayers: 4, settings: {} }]);
    const { engine, calls, getMainPage, getProfilePage } = createMainMenuRig(HellwaveMenu, {
      Multiplayer: { SubscribeSessions: channel.SubscribeSessions },
    });

    engine.Menu.Push('main');

    getMainPage().items[4].action(); // Join -- no profile confirmed yet

    assert.deepEqual(calls.push, ['main', 'hellwave_profile']);
    assert.equal(getProfilePage().items.at(-1).label, 'Continue');
    assert.deepEqual(engine.appendedConsoleText, []); // not connected yet

    getProfilePage().items.at(-1).action(); // accept

    assert.deepEqual(engine.appendedConsoleText, ['connect webrtc://abc\n']);
    assert.equal(engine.GetCvar('hw_profile_confirmed').string, '1');
    assert.equal(engine.Menu.IsOpen(), false);
  });

  void test('receives live session updates while showing, and stops once the page exits', () => {
    const channel = createMockSessionsChannel([{ sessionId: 'first', hostname: 'Alice\'s Server', map: 'hw_doom', currentPlayers: 1, maxPlayers: 4, settings: {} }]);
    const { engine, getMainPage } = createMainMenuRig(HellwaveMenu, {
      Multiplayer: { SubscribeSessions: channel.SubscribeSessions },
    });

    engine.Menu.Push('main');

    assert.equal(channel.activeSubscriberCount, 1);
    assert.deepEqual(getMainPage().items.slice(4).map((item) => item.label), ['Doomed computer station [1/4] --']);

    // Simulates a live server-added/server-updated diff arriving over the channel -- no timer or
    // fetch involved, just the next push.
    channel.push([{ sessionId: 'second', hostname: 'Bob\'s Server', map: 'hw_e1m2', currentPlayers: 2, maxPlayers: 4, settings: {} }]);

    assert.deepEqual(getMainPage().items.slice(4).map((item) => item.label), ['Castle of the damned [2/4] --']);

    engine.Menu.Pop(); // onExit -- must unsubscribe

    assert.equal(channel.activeSubscriberCount, 0);

    // A push after leaving must not reach this page's now-torn-down listener.
    channel.push([{ sessionId: 'third', hostname: 'Carol\'s Server', map: 'hw_doom', currentPlayers: 3, maxPlayers: 4, settings: {} }]);

    assert.deepEqual(getMainPage().items.slice(4).map((item) => item.label), ['Castle of the damned [2/4] --']);
  });

  void test('carries the session\'s map name through to the row even when it is outside the curated list', () => {
    // Thumbnail *rendering* can't be unit-tested here -- Action.draw()/M.DrawBitmapString reach
    // for the engine's real M singleton, not the mocked engineAPI (confirmed by the identical
    // gap in NewGameMenu's own map-picture tests) -- so this only covers that an uncurated map
    // name doesn't break row creation, which is what a missing thumbnail cache entry could do if
    // the lookup weren't null-safe. Actual thumbnail draw behavior is manually verified live.
    const channel = createMockSessionsChannel([{ sessionId: 'abc', hostname: 'Alice\'s Server', map: 'some_future_map', currentPlayers: 1, maxPlayers: 4, settings: {} }]);
    const { engine, getMainPage } = createMainMenuRig(HellwaveMenu, {
      Multiplayer: { SubscribeSessions: channel.SubscribeSessions },
    });

    engine.Menu.Push('main');

    assert.equal(getMainPage().items[4].label, 'some_future_map [1/4] --');

    engine.Menu.Pop();
  });

  void test('a very long hostname does not break row creation', () => {
    // Truncation itself happens inside MainMenu's per-frame draw() (a plain Menu.Print call, not
    // observable through .label the way thumbnail/round-line rendering also isn't -- see the
    // file-level comment on the map-fallback test above). This only guards against the slicing
    // logic throwing (e.g. an off-by-one) when fed something far longer than any real hostname;
    // the actual truncated/rendered text is manually verified live.
    const channel = createMockSessionsChannel([{
      sessionId: 'abc',
      hostname: 'A'.repeat(200),
      map: 'hw_doom',
      currentPlayers: 1,
      maxPlayers: 4,
      settings: {},
    }]);
    const { engine, getMainPage } = createMainMenuRig(HellwaveMenu, {
      Multiplayer: { SubscribeSessions: channel.SubscribeSessions },
    });

    engine.Menu.Push('main');

    assert.equal(getMainPage().items[4].label, 'Doomed computer station [1/4] --');

    engine.Menu.Pop();
  });

  void test('layout.hitTest resolves session rows using the taller row spacing, including over the thumbnail', () => {
    const channel = createMockSessionsChannel([
      { sessionId: 'abc', hostname: 'Alice\'s Server', map: 'hw_doom', currentPlayers: 1, maxPlayers: 4, settings: {} },
      { sessionId: 'def', hostname: 'Bob\'s Server', map: 'hw_e1m2', currentPlayers: 1, maxPlayers: 4, settings: {} },
    ]);
    const { engine, getMainPage } = createMainMenuRig(HellwaveMenu, {
      Multiplayer: { SubscribeSessions: channel.SubscribeSessions },
    });

    engine.Menu.Push('main');

    const page = getMainPage();

    // Row 0 spans y=[100, 152) -- y=145 is past the old 28-tall sidebar spacing's boundary
    // (100+28=128), proving the session column's row height actually grew.
    assert.equal(page.layout.hitTest(page.items, 215, 145), 4);
    // x=212 is inside the 20-wide thumbnail (SESSIONS_X=210), left of where the label itself
    // starts -- confirms the hit region still covers the thumbnail area.
    assert.equal(page.layout.hitTest(page.items, 212, 145), 4);
    assert.equal(page.layout.hitTest(page.items, 215, 155), 5); // row 1, y=[152, 204)
    assert.equal(page.layout.hitTest(page.items, 215, 300), null); // below every row

    engine.Menu.Pop();
  });

  void test('shows a numeric ping, and "N/A" once a probe confirms a host is unreachable', () => {
    // Coverage for plans/session-ping-latency.md Phase 4 -- rows render whatever ping/
    // pingUnreachable SessionDiscovery already computed (never re-sorted or re-derived here, see
    // rebuildSessionRows's own comment); "still probing" (absent ping) is already covered by every
    // other test in this file via its "--" suffix.
    const channel = createMockSessionsChannel([
      { sessionId: 'abc', hostname: 'Alice\'s Server', map: 'hw_doom', currentPlayers: 1, maxPlayers: 4, settings: {}, ping: 42, pingUnreachable: false },
      { sessionId: 'def', hostname: 'Bob\'s Server', map: 'hw_e1m2', currentPlayers: 1, maxPlayers: 4, settings: {}, ping: null, pingUnreachable: true },
    ]);
    const { engine, getMainPage } = createMainMenuRig(HellwaveMenu, {
      Multiplayer: { SubscribeSessions: channel.SubscribeSessions },
    });

    engine.Menu.Push('main');

    assert.deepEqual(getMainPage().items.slice(4).map((item) => item.label), [
      'Doomed computer station [1/4] 42ms',
      'Castle of the damned [1/4] N/A',
    ]);

    engine.Menu.Pop();
  });
});
