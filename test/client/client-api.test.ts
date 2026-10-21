import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import Vector from '../../../../shared/Vector.ts';
import type { ViewInput, ViewResult } from '../../../../shared/GameInterfaces.ts';
import { asClientEngineAPI, captureRegisteredPages, createMockClientEngine, type MockTexture } from '../../../id1/test/client/fixtures.ts';
import { createClientdata } from './fixtures.ts';

await import('../../../id1/GameAPI.ts');

const { clientEvent, clientEventName, items } = await import('../../Defs.ts');
const clientApiModule = await import('../../client/ClientAPI.ts');

const { ClientGameAPI } = clientApiModule;

/**
 * The loading screen the game loaded, which the mock engine makes as a {@link MockTexture}.
 * @returns The texture, or null when there is none.
 */
function loadingScreen(): MockTexture | null {
  // The mock engine's LoadPic* makes MockTextures where the real one makes GLTextures.
  return ClientGameAPI.loadingScreen as unknown as MockTexture | null;
}

void describe('Hellwave client API', () => {
  void test('suppresses the viewmodel while spectating and renders navigation hints as rocket trails', () => {
    const engine = createMockClientEngine();
    const clientGame = new ClientGameAPI(asClientEngineAPI(engine));

    clientGame.init();
    clientGame.clientdata = createClientdata({
      spectating: true,
      weapon: items.IT_SHOTGUN,
      weaponframe: 2,
    });

    engine.eventBus.publish(
      clientEventName(clientEvent.NAV_HINT),
      new Vector(0, 0, 0),
      new Vector(32, 0, 0),
      new Vector(64, 32, 0),
      new Vector(96, 32, 0),
    );
    clientGame.startFrame();

    assert.equal(clientGame.viewmodel.visible, false);
    assert.equal(clientGame.viewmodel.model, null);
    assert.equal(engine.rocketTrails.length, 7);
    assert.ok(engine.rocketTrails.every((trail) => trail.type === 7));
    assert.deepEqual(engine.sounds.map((sound) => sound.name), [
      'phase/quiet.mp3',
      'phase/normal-1.mp3',
      'phase/normal-2.mp3',
    ]);
  });

  void test('loads and frees the loading screen while applying bloom defaults', async () => {
    const engine = createMockClientEngine();

    ClientGameAPI.Init(asClientEngineAPI(engine));
    await Promise.resolve();

    assert.equal(loadingScreen()?.name, 'gfx/loadingscreen.png');
    assert.equal(loadingScreen()?.lockedTextureMode, 'GL_LINEAR');
    assert.deepEqual(engine.cvarSets, [
      ['r_bloom', true],
      ['r_bloom_downsample', 8],
      ['r_bloom_dlight_strength', 0.33],
      ['r_bloom_sky_strength', 0.33],
      ['r_bloom_specular_strength', 0.33],
      ['r_bloom_strength', 1],
    ]);

    const loaded = loadingScreen();
    ClientGameAPI.Shutdown(asClientEngineAPI(engine));

    assert.equal(loaded?.freed, true);
    assert.equal(ClientGameAPI.loadingScreen, null);
  });

  void test('gives a fresh player a randomized name instead of the shared "player" default', () => {
    const engine = createMockClientEngine({}, { cvars: { _cl_name: 'player' } });
    const originalRandom = Math.random;
    Math.random = () => 0;

    try {
      ClientGameAPI.Init(asClientEngineAPI(engine));
    } finally {
      Math.random = originalRandom;
    }

    assert.notEqual(engine.GetCvar('_cl_name').string, 'player');
    assert.match(engine.GetCvar('_cl_name').string, /^[A-Z][a-z]+[A-Z][a-z]+\d+$/);
  });

  void test('leaves an existing custom name untouched', () => {
    const engine = createMockClientEngine({}, { cvars: { _cl_name: 'ReturningPlayer' } });

    ClientGameAPI.Init(asClientEngineAPI(engine));

    assert.equal(engine.GetCvar('_cl_name').string, 'ReturningPlayer');
  });

  void test('registers the hellwave main menu page alongside the shared id1 utility pages, not the classic front end', () => {
    const engine = createMockClientEngine();
    const pages = captureRegisteredPages(engine);

    ClientGameAPI.Init(asClientEngineAPI(engine));

    // Regression test: Id1ClientGameAPI.Init used to unconditionally build id1's whole classic
    // single-player front end (main/singleplayer/load/save/multiplayer/launch_server/help) and
    // load its pics, even though hellwave replaces 'main' and never navigates to the rest. See
    // plans/hellwave-menu-asset-cleanup.md.
    assert.deepEqual(
      [...pages.keys()].sort(),
      ['alert', 'hellwave_newgame', 'hellwave_newgame_settings', 'hellwave_profile', 'keys', 'main', 'options', 'quit'],
    );

    engine.Menu.Push('main');
    assert.equal(engine.Menu.IsOpen('main'), true);

    // 'main' starts a session-list poll interval on activate (onEnter) -- pop it so that
    // interval is cleared (onExit) instead of leaking past this test.
    engine.Menu.Pop();
  });

  void test('sets \'main\' as the root page itself, since Id1Menu no longer does it for classicFrontend: false', () => {
    const engine = createMockClientEngine();
    let rootPageName: string | null = null;
    engine.Menu.SetRootPage = (name: string) => { rootPageName = name; };

    // Regression test: HellwaveMenu relied on Id1Menu.Init's unconditional Menu.SetRootPage('main')
    // call as a side effect (root resolves lazily by name, so re-registering 'main' afterwards
    // still worked). Once Id1Menu.Init started skipping that call for classicFrontend: false,
    // nothing set the root page at all, and the real engine's MenuStack.pushRoot() asserted on
    // startup. See plans/hellwave-menu-asset-cleanup.md.
    ClientGameAPI.Init(asClientEngineAPI(engine));

    assert.equal(rootPageName, 'main');
  });

  void test('reaches HellwaveHUD.Init through the game-module Init chain, not just the inherited Q1HUD.Init', async () => {
    const engine = createMockClientEngine();

    // Regression test: `ClientGameAPI.Init` (id1) used to call `Q1HUD.Init` directly, so a
    // subclass's own static Init (registering `hw_buymenu`) never ran in production even though
    // it worked fine when tests invoked `HellwaveHUD.Init` directly.
    ClientGameAPI.Init(asClientEngineAPI(engine));
    await Promise.resolve(); // flush the loading-screen load Init kicks off

    assert.equal(engine.commands.has('hw_buymenu'), true);

    ClientGameAPI.Shutdown(asClientEngineAPI(engine));
    assert.equal(engine.commands.has('hw_buymenu'), false);
  });
});

/** The result of a view calculation, which the mock engine marks when the engine's own calculation ran. */
type DefaultableViewResult = ViewResult & { defaulted?: boolean };

/** The view input with writable members, so that a test can change the frame time. */
type MutableViewInput = { -readonly [Name in keyof ViewInput]: ViewInput[Name] };

void describe('Hellwave first-person view (prototype of calcView)', () => {
  /**
   * What the engine gives a game to calculate the view from, and where it puts the result.
   * @returns Both, with the vectors filled in.
   */
  function createViewFrame(): { input: MutableViewInput; result: DefaultableViewResult } {
    return {
      input: {
        origin: new Vector(100, 200, 300),
        angles: new Vector(0, 90, 0),
        velocity: new Vector(250, 0, 0),
        viewangles: new Vector(10, 45, 3),
        punchangle: new Vector(1, 2, 0),
        viewheight: 22,
        onground: true,
        time: 12,
        frametime: 0.1,
        viewsize: 120,
      },
      result: {
        vieworg: new Vector(),
        viewangles: new Vector(),
        weaponOrigin: new Vector(),
        weaponAngles: new Vector(),
      },
    };
  }

  /**
   * Builds the game with `hw_view` set.
   * @param variant The value of `hw_view`.
   * @returns Both.
   */
  function create(variant: string) {
    const engine = createMockClientEngine();

    ClientGameAPI.Init(asClientEngineAPI(engine));
    engine.SetCvar('hw_view', variant);

    const clientGame = new ClientGameAPI(asClientEngineAPI(engine));
    clientGame.init();

    return { engine, clientGame };
  }

  void test('takes the engine\'s view while hw_view is 0', () => {
    const { clientGame } = create('0');
    const { input, result } = createViewFrame();

    clientGame.calcView(input, result);

    assert.equal(result.defaulted, true);
  });

  void test('puts the eye at the origin and view height, with no bob, roll or sway, when hw_view is 1', () => {
    const { clientGame } = create('1');
    const { input, result } = createViewFrame();

    clientGame.calcView(input, result);

    assert.equal(result.defaulted, undefined);
    assert.deepEqual(Array.from(result.vieworg), [100, 200, 322]);
    // the view angles as the player holds them, and the punch of the server on top; no roll from the 250 units of
    // speed along the player's right axis
    assert.deepEqual(Array.from(result.viewangles), [11, 47, 3]);
    assert.deepEqual(Array.from(result.weaponOrigin), [100, 200, 322]);
    assert.deepEqual(Array.from(result.weaponAngles), [-10, 45, 3]);
  });

  void test('lifts the view for a hit, by what got through, and lets it down again', () => {
    const { engine, clientGame } = create('1');
    const { input, result } = createViewFrame();

    engine.eventBus.publish('client.damage', { damageReceived: 40, armorLost: 0, attackOrigin: new Vector() });
    clientGame.calcView(input, result);
    // 40 * 0.15 = 6 degrees, less the 1.2 that fell off during this frame
    assert.ok(Math.abs(result.viewangles[0] - (11 - 4.8)) < 1e-4);

    for (let frame = 0; frame < 10; frame++) {
      clientGame.calcView(input, result);
    }

    assert.equal(result.viewangles[0], 11);
  });

  void test('never lifts it by more than 10 degrees', () => {
    const { engine, clientGame } = create('1');
    const { input, result } = createViewFrame();
    input.frametime = 0;

    for (let hit = 0; hit < 20; hit++) {
      engine.eventBus.publish('client.damage', { damageReceived: 100, armorLost: 0, attackOrigin: new Vector() });
    }
    clientGame.calcView(input, result);

    assert.equal(result.viewangles[0], 11 - 10);
  });
});
