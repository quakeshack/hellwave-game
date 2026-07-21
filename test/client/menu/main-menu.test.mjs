import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { K } from '../../../../../shared/Keys.ts';
import { createMainMenuRig, withMockTimers } from './fixtures.mjs';

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

    // Row y-positions: New Game (y=56), Profile (y=80), Options (y=104), Quit (y=128), each 24 tall.
    // This is what actually fixes the "hover doesn't move the cursor on the main menu" bug -- the
    // previous implementation had no real `layout`/`items` for `updateHover()` to resolve against.
    page.updateHover(30, 110);
    assert.equal(page.cursor, 2); // Options

    page.updateHover(30, 80);
    assert.equal(page.cursor, 1); // Profile

    page.updateHover(30, 128);
    assert.equal(page.cursor, 3); // Quit
  });

  void test('layout.hitTest resolves sidebar rows within their own column and ignores the empty session column', () => {
    const { getMainPage } = createMainMenuRig(HellwaveMenu);
    const page = getMainPage();

    assert.equal(page.layout.hitTest(page.items, 30, 56), 0); // New Game
    assert.equal(page.layout.hitTest(page.items, 30, 128), 3); // Quit
    assert.equal(page.layout.hitTest(page.items, 200, 56), null); // session column, nothing there yet
    assert.equal(page.layout.hitTest(page.items, 30, 500), null); // below every row
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
  void test('onEnter fetches sessions immediately and shows one row per session', async () => {
    const { engine, getMainPage } = createMainMenuRig(HellwaveMenu, {
      Multiplayer: {
        ListSessions: () => Promise.resolve([
          { sessionId: 'abc', map: 'hw_doom', currentPlayers: 2, maxPlayers: 4 },
          { sessionId: 'def', map: 'hw_e1m2', currentPlayers: 1, maxPlayers: 4 },
        ]),
      },
    });

    engine.Menu.Push('main');
    await Promise.resolve();
    await Promise.resolve();

    assert.deepEqual(getMainPage().items.slice(4).map((item) => item.label), [
      'hw_doom [2/4]',
      'hw_e1m2 [1/4]',
    ]);

    engine.Menu.Pop();
  });

  void test('shows "No active games." when the list is empty', async () => {
    const { engine, getMainPage } = createMainMenuRig(HellwaveMenu); // default mock resolves []

    engine.Menu.Push('main');
    await Promise.resolve();
    await Promise.resolve();

    assert.deepEqual(getMainPage().items.slice(4).map((item) => item.label), ['No active games.']);

    engine.Menu.Pop();
  });

  void test('shows "Game lobby error." when the fetch rejects', async () => {
    const { engine, getMainPage } = createMainMenuRig(HellwaveMenu, {
      Multiplayer: { ListSessions: () => Promise.reject(new Error('network down')) },
    });

    engine.Menu.Push('main');
    await Promise.resolve();
    await Promise.resolve();

    assert.deepEqual(getMainPage().items.slice(4).map((item) => item.label), ['Game lobby error.']);

    engine.Menu.Pop();
  });

  void test('joining a session connects and closes the menu once a profile is confirmed', async () => {
    const { engine, getMainPage } = createMainMenuRig(HellwaveMenu, {
      Multiplayer: { ListSessions: () => Promise.resolve([{ sessionId: 'abc', map: 'hw_doom', currentPlayers: 1, maxPlayers: 4 }]) },
    });
    engine.SetCvar('hw_profile_confirmed', '1');

    engine.Menu.Push('main');
    await Promise.resolve();
    await Promise.resolve();

    getMainPage().items[4].action();

    assert.deepEqual(engine.appendedConsoleText, ['connect webrtc://abc\n']);
    assert.equal(engine.Menu.IsOpen(), false); // Menu.Close(), same as id1's launch_server join
  });

  void test('joining a session opens the profile gate first when unconfirmed, and accepting connects', async () => {
    const { engine, calls, getMainPage, getProfilePage } = createMainMenuRig(HellwaveMenu, {
      Multiplayer: { ListSessions: () => Promise.resolve([{ sessionId: 'abc', map: 'hw_doom', currentPlayers: 1, maxPlayers: 4 }]) },
    });

    engine.Menu.Push('main');
    await Promise.resolve();
    await Promise.resolve();

    getMainPage().items[4].action(); // Join -- no profile confirmed yet

    assert.deepEqual(calls.push, ['main', 'hellwave_profile']);
    assert.equal(getProfilePage().items.at(-1).label, 'Continue');
    assert.deepEqual(engine.appendedConsoleText, []); // not connected yet

    getProfilePage().items.at(-1).action(); // accept

    assert.deepEqual(engine.appendedConsoleText, ['connect webrtc://abc\n']);
    assert.equal(engine.GetCvar('hw_profile_confirmed').string, '1');
    assert.equal(engine.Menu.IsOpen(), false);
  });

  void test('polls for fresh sessions on an interval while showing, and stops once the page exits', async () => {
    let callCount = 0;
    const { engine, getMainPage } = createMainMenuRig(HellwaveMenu, {
      Multiplayer: {
        ListSessions: () => {
          callCount++;
          return Promise.resolve(callCount === 1
            ? [{ sessionId: 'first', map: 'hw_doom', currentPlayers: 1, maxPlayers: 4 }]
            : [{ sessionId: 'second', map: 'hw_e1m2', currentPlayers: 2, maxPlayers: 4 }]);
        },
      },
    });

    await withMockTimers(async ({ intervals, tick }) => {
      engine.Menu.Push('main');
      await Promise.resolve();
      await Promise.resolve();

      assert.equal(callCount, 1);
      assert.equal(intervals.length, 1);
      assert.deepEqual(getMainPage().items.slice(4).map((item) => item.label), ['hw_doom [1/4]']);

      tick(intervals[0]);
      await Promise.resolve();
      await Promise.resolve();

      assert.equal(callCount, 2);
      assert.deepEqual(getMainPage().items.slice(4).map((item) => item.label), ['hw_e1m2 [2/4]']);

      engine.Menu.Pop(); // onExit -- must clear the interval

      assert.equal(intervals[0].cleared, true);

      tick(intervals[0]); // tick() itself checks .cleared and no-ops
      await Promise.resolve();

      assert.equal(callCount, 2); // unchanged
    });
  });

  void test('skips a poll tick while the previous fetch is still in flight, instead of racing it', async () => {
    let resolveFirstFetch;
    let fetchCallCount = 0;
    const { engine } = createMainMenuRig(HellwaveMenu, {
      Multiplayer: {
        ListSessions: () => {
          fetchCallCount++;
          if (fetchCallCount === 1) {
            return new Promise((resolve) => { resolveFirstFetch = resolve; });
          }
          return Promise.resolve([]);
        },
      },
    });

    await withMockTimers(async ({ intervals, tick }) => {
      engine.Menu.Push('main');
      await Promise.resolve(); // onEnter's immediate refresh starts, but its fetch never resolves yet

      assert.equal(fetchCallCount, 1);

      tick(intervals[0]); // a poll tick while the first fetch is still pending
      await Promise.resolve();

      assert.equal(fetchCallCount, 1); // skipped -- sessionRefreshInFlight guard

      resolveFirstFetch([]);
      await Promise.resolve();
      await Promise.resolve();

      tick(intervals[0]); // now the guard is clear again
      await Promise.resolve();

      assert.equal(fetchCallCount, 2);

      engine.Menu.Pop();
    });
  });
});
