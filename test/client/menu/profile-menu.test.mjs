import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { K } from '../../../../../shared/Keys.ts';
import { createMainMenuRig } from './fixtures.mjs';

await import('../../../../id1/GameAPI.ts');

const { default: HellwaveMenu } = await import('../../../client/menu/Menu.ts');

void describe('Hellwave profile page', () => {
  void test('onEnter loads the current name into the field', () => {
    const { engine, getMainPage, getProfilePage } = createMainMenuRig(HellwaveMenu);
    engine.SetCvar('_cl_name', 'Grunt99');

    getMainPage().items[1].action(); // Profile, standalone

    assert.equal(getProfilePage().items[0].value, 'Grunt99');
  });

  void test('opening standalone from the sidebar uses the default label and just pops back on accept', () => {
    const { calls, getMainPage, getProfilePage } = createMainMenuRig(HellwaveMenu);

    getMainPage().items[1].action();
    const page = getProfilePage();

    assert.equal(page.items.at(-1).label, 'Accept');

    page.items.at(-1).action();

    assert.equal(calls.pop, 1);
    assert.deepEqual(calls.push, ['hellwave_profile']); // no map picker opened, this wasn't a gate
  });

  void test('accepting with an unchanged name sends no console text, but still confirms the profile', () => {
    const { engine, getMainPage, getProfilePage } = createMainMenuRig(HellwaveMenu);
    engine.SetCvar('_cl_name', 'Grunt99');

    getMainPage().items[1].action();
    getProfilePage().items.at(-1).action();

    assert.deepEqual(engine.appendedConsoleText, []);
    assert.equal(engine.GetCvar('hw_profile_confirmed').string, '1');
  });

  void test('accepting a changed name sends the name command', () => {
    const { engine, getMainPage, getProfilePage } = createMainMenuRig(HellwaveMenu);
    engine.SetCvar('_cl_name', 'Grunt99');

    getMainPage().items[1].action();
    const page = getProfilePage();
    page.items[0].value = 'NewName';
    page.items.at(-1).action();

    assert.deepEqual(engine.appendedConsoleText, ['name "NewName"\n']);
  });

  void test('accepting a changed color sends the color command', () => {
    const { engine, getMainPage, getProfilePage } = createMainMenuRig(HellwaveMenu);
    engine.SetCvar('_cl_color', '0');

    getMainPage().items[1].action();
    const page = getProfilePage();
    page.items[1].setValue(3); // vest
    page.items[2].setValue(7); // pants
    page.items.at(-1).action();

    assert.deepEqual(engine.appendedConsoleText, ['color 3 7\n']);
  });

  void test('Escape pops back without confirming the profile or sending anything', () => {
    const { engine, calls, getMainPage, getProfilePage } = createMainMenuRig(HellwaveMenu);
    engine.SetCvar('_cl_name', 'Grunt99');

    getMainPage().items[1].action();
    getProfilePage().items[0].value = 'NewName';
    getProfilePage().handleInput(K.ESCAPE);

    assert.equal(calls.pop, 1);
    assert.deepEqual(engine.appendedConsoleText, []);
    assert.equal(engine.GetCvar('hw_profile_confirmed').string, '0');
  });

  void test('attaches the header bitmap font to the Accept/Continue button once it finishes loading', async () => {
    const { getMainPage, getProfilePage } = createMainMenuRig(HellwaveMenu);

    getMainPage().items[1].action();
    const page = getProfilePage();

    assert.equal(page.items.at(-1).font, null);

    await Promise.resolve(); // flush LoadBitmapFont's promise

    assert.equal(page.items.at(-1).font.charset, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  });

  void test('layout.hitTest resolves the Name/Vest/Pants fields and the bottom-right Accept button', async () => {
    const { getMainPage, getProfilePage } = createMainMenuRig(HellwaveMenu);

    getMainPage().items[1].action(); // standalone, "Accept" label
    const page = getProfilePage();

    await Promise.resolve(); // flush LoadBitmapFont's promise, so Accept is measured with the real font

    // Field rows no longer care about px (the whole row width is clickable) -- only py matters.
    assert.equal(page.layout.hitTest(page.items, 999, 110), 0); // Name field row (startY=100, 24 tall)
    assert.equal(page.layout.hitTest(page.items, 999, 132), 1); // Vest field row (24 tall)
    assert.equal(page.layout.hitTest(page.items, 999, 160), 2); // Pants field row (36 tall)
    // "Accept" is 6 chars * 14px (mock cellWidth) = 84px wide, right/bottom edges at (632, 352).
    assert.equal(page.layout.hitTest(page.items, 590, 344), 3); // Accept, bottom-right corner
    assert.equal(page.layout.hitTest(page.items, 500, 344), null); // left of Accept's column
    assert.equal(page.layout.hitTest(page.items, 590, 50), null); // above Accept's row
  });
});
