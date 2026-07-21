import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import Vector from '../../../../shared/Vector.ts';
import { captureRegisteredPages, createMockClientEngine } from '../../../id1/test/client/fixtures.ts';
import { createClientdata } from './fixtures.mjs';

await import('../../../id1/GameAPI.ts');

const { clientEvent, clientEventName, items } = await import('../../Defs.ts');
const clientApiModule = await import('../../client/ClientAPI.ts');

const { ClientGameAPI } = clientApiModule;

void describe('Hellwave client API', () => {
  void test('suppresses the viewmodel while spectating and renders navigation hints as rocket trails', () => {
    const engine = createMockClientEngine();
    const clientGame = new ClientGameAPI(engine);

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

    ClientGameAPI.Init(engine);
    await Promise.resolve();

    assert.equal(ClientGameAPI.loadingScreen?.name, 'gfx/loadingscreen.png');
    assert.equal(ClientGameAPI.loadingScreen?.lockedTextureMode, 'GL_LINEAR');
    assert.deepEqual(engine.cvarSets, [
      ['r_bloom', true],
      ['r_bloom_downsample', 8],
      ['r_bloom_dlight_strength', 0.33],
      ['r_bloom_sky_strength', 0.33],
      ['r_bloom_specular_strength', 0.33],
      ['r_bloom_strength', 1],
    ]);

    const loadingScreen = ClientGameAPI.loadingScreen;
    ClientGameAPI.Shutdown(engine);

    assert.equal(loadingScreen?.freed, true);
    assert.equal(ClientGameAPI.loadingScreen, null);
  });

  void test('gives a fresh player a randomized name instead of the shared "player" default', () => {
    const engine = createMockClientEngine({}, { cvars: { _cl_name: 'player' } });
    const originalRandom = Math.random;
    Math.random = () => 0;

    try {
      ClientGameAPI.Init(engine);
    } finally {
      Math.random = originalRandom;
    }

    assert.notEqual(engine.GetCvar('_cl_name').string, 'player');
    assert.match(engine.GetCvar('_cl_name').string, /^[A-Z][a-z]+[A-Z][a-z]+\d+$/);
  });

  void test('leaves an existing custom name untouched', () => {
    const engine = createMockClientEngine({}, { cvars: { _cl_name: 'ReturningPlayer' } });

    ClientGameAPI.Init(engine);

    assert.equal(engine.GetCvar('_cl_name').string, 'ReturningPlayer');
  });

  void test('registers the hellwave main menu page alongside the shared id1 utility pages, not the classic front end', () => {
    const engine = createMockClientEngine();
    const pages = captureRegisteredPages(engine);

    ClientGameAPI.Init(engine);

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
    let rootPageName = null;
    engine.Menu.SetRootPage = (name) => { rootPageName = name; };

    // Regression test: HellwaveMenu relied on Id1Menu.Init's unconditional Menu.SetRootPage('main')
    // call as a side effect (root resolves lazily by name, so re-registering 'main' afterwards
    // still worked). Once Id1Menu.Init started skipping that call for classicFrontend: false,
    // nothing set the root page at all, and the real engine's MenuStack.pushRoot() asserted on
    // startup. See plans/hellwave-menu-asset-cleanup.md.
    ClientGameAPI.Init(engine);

    assert.equal(rootPageName, 'main');
  });

  void test('reaches HellwaveHUD.Init through the game-module Init chain, not just the inherited Q1HUD.Init', async () => {
    const engine = createMockClientEngine();

    // Regression test: `ClientGameAPI.Init` (id1) used to call `Q1HUD.Init` directly, so a
    // subclass's own static Init (registering `hw_buymenu`) never ran in production even though
    // it worked fine when tests invoked `HellwaveHUD.Init` directly.
    ClientGameAPI.Init(engine);
    await Promise.resolve(); // flush the loading-screen load Init kicks off

    assert.equal(engine.commands.has('hw_buymenu'), true);

    ClientGameAPI.Shutdown(engine);
    assert.equal(engine.commands.has('hw_buymenu'), false);
  });
});
