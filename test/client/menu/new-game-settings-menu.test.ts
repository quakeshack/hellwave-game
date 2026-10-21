import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { K } from '../../../../../shared/Keys.ts';
import { Action, NumberInput, Toggle } from '../../../../../engine/client/menu/MenuItem.ts';
import type { MockClientEngine } from '../../../../id1/test/client/fixtures.ts';
import { createMainMenuRig, pressItem, layoutOf, itemAt } from './fixtures.ts';

await import('../../../../id1/GameAPI.ts');

const { default: HellwaveMenu } = await import('../../../client/menu/Menu.ts');

void describe('Hellwave new game settings', () => {
  void test('onEnter loads the current rounds, max players, quiet time, and private-game state from cvars', () => {
    const { engine, getNewGamePage, getNewGameSettingsPage } = createMainMenuRig(HellwaveMenu);
    engine.SetCvar('hw_rounds', '6');
    engine.SetCvar('hw_maxplayers', '3');
    engine.SetCvar('hw_quiet_time', '45');
    engine.SetCvar('sv_public', '0'); // 0 = private

    pressItem(getNewGamePage(), 0); // hw_doom -- opens the settings screen
    const page = getNewGameSettingsPage();

    assert.equal(itemAt(page, 0, NumberInput).getValue(), 6);
    assert.equal(itemAt(page, 1, NumberInput).getValue(), 3);
    assert.equal(itemAt(page, 1, NumberInput).max, 4); // hw_doom's own MapDetails.maxplayers cap
    assert.equal(itemAt(page, 2, NumberInput).getValue(), 45);
    assert.equal(itemAt(page, 3, Toggle).getValue(), 1); // private toggle is "on"
  });

  void test('defaults to 10 rounds, the map\'s own capacity, 90s quiet time, and public when the cvars have never been set', () => {
    // The real engine's GetCvar() returns null for a cvar that was never registered (Cvar.FindVar
    // semantics); the mock auto-vivifies instead, so this override restores the real contract for
    // this one test.
    const { getNewGamePage, getNewGameSettingsPage } = // The mock engine's type has GetCvar answer a cvar always.
    createMainMenuRig(HellwaveMenu, { GetCvar: (() => null) as unknown as MockClientEngine['GetCvar'] });

    pressItem(getNewGamePage(), 0);
    const page = getNewGameSettingsPage();

    assert.equal(itemAt(page, 0, NumberInput).getValue(), 10);
    assert.equal(itemAt(page, 1, NumberInput).getValue(), 4); // hw_doom's own MapDetails.maxplayers cap
    assert.equal(itemAt(page, 2, NumberInput).getValue(), 90);
    assert.equal(itemAt(page, 3, Toggle).getValue(), 0); // public by default
  });

  void test('clamps a stored max-players value that exceeds the selected map\'s capacity', () => {
    const { engine, getNewGamePage, getNewGameSettingsPage } = createMainMenuRig(HellwaveMenu);
    engine.SetCvar('hw_maxplayers', '99'); // stale value from a map with a higher cap

    pressItem(getNewGamePage(), 0); // hw_doom, capped at 4
    const page = getNewGameSettingsPage();

    assert.equal(itemAt(page, 1, NumberInput).getValue(), 4);
  });

  void test('Quiet Time field is bounded to 30-120 seconds', () => {
    const { getNewGamePage, getNewGameSettingsPage } = createMainMenuRig(HellwaveMenu);

    pressItem(getNewGamePage(), 0);
    const page = getNewGameSettingsPage();

    assert.equal(itemAt(page, 2, NumberInput).min, 30);
    assert.equal(itemAt(page, 2, NumberInput).max, 120);
  });

  void test('Start always hosts a multiplayer game on the selected map, never a bare singleplayer map', () => {
    const { engine, calls, getNewGamePage, getNewGameSettingsPage } = createMainMenuRig(HellwaveMenu);

    pressItem(getNewGamePage(), 1); // hw_e1m2
    pressItem(getNewGameSettingsPage(), -1); // Start, no changes made

    assert.deepEqual(calls.startMultiplayerGame, ['hw_e1m2']);
    assert.equal(calls.forceClose, 1);
    assert.deepEqual(engine.appendedConsoleText, []); // disconnect only sent when a server is active
  });

  void test('Start disconnects first when a server is already active', () => {
    const { engine, getNewGamePage, getNewGameSettingsPage } = createMainMenuRig(HellwaveMenu);
    engine.SV.active = true;

    pressItem(getNewGamePage(), 0);
    pressItem(getNewGameSettingsPage(), -1);

    assert.deepEqual(engine.appendedConsoleText, ['disconnect\n']);
  });

  void test('Start commits rounds/max-players/quiet-time/private-game only when actually changed from what was loaded', () => {
    const { engine, getNewGamePage, getNewGameSettingsPage } = createMainMenuRig(HellwaveMenu);
    engine.SetCvar('hw_rounds', '10');
    engine.SetCvar('hw_maxplayers', '4');
    engine.SetCvar('hw_quiet_time', '90');
    engine.SetCvar('sv_public', '1');
    engine.SetCvar('_cl_name', 'Christian');
    engine.cvarSets.length = 0; // discard the setup writes above

    pressItem(getNewGamePage(), 0);
    const page = getNewGameSettingsPage();
    itemAt(page, 0, NumberInput).setValue(5); // Rounds: 5
    itemAt(page, 1, NumberInput).setValue(2); // Max Players: 2
    itemAt(page, 2, NumberInput).setValue(60); // Quiet Time: 60
    itemAt(page, 3, Toggle).setValue(1); // private
    pressItem(page, -1); // Start

    assert.deepEqual(engine.cvarSets, [
      ['hw_rounds', '5'],
      ['sv_public', '0'],
      ['hw_maxplayers', '2'],
      ['hw_quiet_time', '60'],
      ['hostname', "Christian's game"],
    ]);
  });

  void test('Start does not touch cvars that were left unchanged', () => {
    const { engine, getNewGamePage, getNewGameSettingsPage } = createMainMenuRig(HellwaveMenu);
    engine.SetCvar('hw_rounds', '10');
    engine.SetCvar('hw_maxplayers', '4');
    engine.SetCvar('hw_quiet_time', '90');
    engine.SetCvar('sv_public', '1');
    engine.cvarSets.length = 0; // discard the setup writes above

    pressItem(getNewGamePage(), 0);
    pressItem(getNewGameSettingsPage(), -1); // Start, no changes made

    // hostname is committed unconditionally on every Start (see the dedicated tests below) --
    // this test only cares that hw_rounds/hw_maxplayers/hw_quiet_time/sv_public are left alone
    // when unchanged.
    assert.deepEqual(engine.cvarSets.filter(([name]) => name !== 'hostname'), []);
  });

  void describe('Start sets hostname from the profile name', () => {
    void test('derives "<name>\'s game" from the current _cl_name', () => {
      const { engine, getNewGamePage, getNewGameSettingsPage } = createMainMenuRig(HellwaveMenu);
      engine.SetCvar('_cl_name', 'Christian');
      engine.cvarSets.length = 0; // discard the setup write above

      pressItem(getNewGamePage(), 0);
      pressItem(getNewGameSettingsPage(), -1); // Start, no other changes

      assert.deepEqual(engine.cvarSets, [['hostname', "Christian's game"]]);
    });

    void test('falls back to UNNAMED when the profile name is empty or whitespace-only', () => {
      const { engine, getNewGamePage, getNewGameSettingsPage } = createMainMenuRig(HellwaveMenu);
      engine.SetCvar('_cl_name', '   ');
      engine.cvarSets.length = 0;

      pressItem(getNewGamePage(), 0);
      pressItem(getNewGameSettingsPage(), -1); // Start

      assert.deepEqual(engine.cvarSets, [['hostname', 'UNNAMED']]);
    });

    void test('is committed every Start, unlike hw_rounds/sv_public which only commit on change', () => {
      const { engine, getNewGamePage, getNewGameSettingsPage } = createMainMenuRig(HellwaveMenu);
      engine.SetCvar('_cl_name', 'Christian');
      engine.SetCvar('hostname', "Christian's game"); // already matches what Start would compute
      engine.cvarSets.length = 0;

      pressItem(getNewGamePage(), 0);
      pressItem(getNewGameSettingsPage(), -1); // Start, hostname value unchanged

      assert.deepEqual(engine.cvarSets, [['hostname', "Christian's game"]]);
    });
  });

  void test('Escape pops back to the map picker', () => {
    const { calls, getNewGamePage, getNewGameSettingsPage } = createMainMenuRig(HellwaveMenu);

    pressItem(getNewGamePage(), 0);
    getNewGameSettingsPage().handleInput(K.ESCAPE);

    assert.equal(calls.pop, 1);
  });

  void test('attaches the header bitmap font to the Start button once it finishes loading', async () => {
    const { getNewGamePage, getNewGameSettingsPage } = createMainMenuRig(HellwaveMenu);

    pressItem(getNewGamePage(), 0);
    const page = getNewGameSettingsPage();

    assert.equal(itemAt(page, -1, Action).font, null);

    await Promise.resolve(); // flush LoadBitmapFont's promise

    assert.equal(itemAt(page, -1, Action).font?.charset, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  });

  void test('layout.hitTest resolves the Rounds/Max Players/Quiet Time/Private Game fields and the right-aligned Start button', async () => {
    const { getNewGamePage, getNewGameSettingsPage } = createMainMenuRig(HellwaveMenu);

    pressItem(getNewGamePage(), 0);
    const page = getNewGameSettingsPage();

    await Promise.resolve(); // flush LoadBitmapFont's promise, so Start is measured with the real font

    // Field rows no longer care about px (the whole row width is clickable) -- only py matters.
    // Each row is item.getHeight() (8, default) + spacing (12) = 20 virtual units tall.
    assert.equal(layoutOf(page).hitTest(page.items, 999, 174), 0); // Rounds field row (startY=170)
    assert.equal(layoutOf(page).hitTest(page.items, 999, 194), 1); // Max Players field row (170+20)
    assert.equal(layoutOf(page).hitTest(page.items, 999, 214), 2); // Quiet Time field row (170+40)
    assert.equal(layoutOf(page).hitTest(page.items, 999, 234), 3); // Private Game field row (170+60)
    // "Start!" is 6 chars * 14px (mock cellWidth) = 84px wide, right/bottom edges at (632, 352).
    assert.equal(layoutOf(page).hitTest(page.items, 590, 344), 4); // Start, bottom-right corner
    assert.equal(layoutOf(page).hitTest(page.items, 500, 344), null); // left of Start's column
    assert.equal(layoutOf(page).hitTest(page.items, 590, 100), null); // above Start's row
  });
});
