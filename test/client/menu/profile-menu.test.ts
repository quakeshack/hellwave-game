import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { K } from '../../../../../shared/Keys.ts';
import { Action, ColorPicker, Textbox } from '../../../../../engine/client/menu/MenuItem.ts';
import { createMainMenuRig, pressItem, layoutOf, itemAt } from './fixtures.ts';

await import('../../../../id1/GameAPI.ts');

const { default: HellwaveMenu } = await import('../../../client/menu/Menu.ts');

void describe('Hellwave profile page', () => {
  void test('onEnter loads the current name into the field', () => {
    const { engine, getMainPage, getProfilePage } = createMainMenuRig(HellwaveMenu);
    engine.SetCvar('_cl_name', 'Grunt99');

    pressItem(getMainPage(), 1); // Profile, standalone

    assert.equal(itemAt(getProfilePage(), 0, Textbox).value, 'Grunt99');
  });

  void test('opening standalone from the sidebar uses the default label and just pops back on accept', () => {
    const { calls, getMainPage, getProfilePage } = createMainMenuRig(HellwaveMenu);

    pressItem(getMainPage(), 1);
    const page = getProfilePage();

    assert.equal(page.items.at(-1)?.label, 'Accept');

    pressItem(page, -1);

    assert.equal(calls.pop, 1);
    assert.deepEqual(calls.push, ['hellwave_profile']); // no map picker opened, this wasn't a gate
  });

  void test('accepting with an unchanged name sends no console text, but still confirms the profile', () => {
    const { engine, getMainPage, getProfilePage } = createMainMenuRig(HellwaveMenu);
    engine.SetCvar('_cl_name', 'Grunt99');

    pressItem(getMainPage(), 1);
    pressItem(getProfilePage(), -1);

    assert.deepEqual(engine.appendedConsoleText, []);
    assert.equal(engine.GetCvar('hw_profile_confirmed').string, '1');
  });

  void test('accepting a changed name sends the name command', () => {
    const { engine, getMainPage, getProfilePage } = createMainMenuRig(HellwaveMenu);
    engine.SetCvar('_cl_name', 'Grunt99');

    pressItem(getMainPage(), 1);
    const page = getProfilePage();
    itemAt(page, 0, Textbox).value = 'NewName';
    pressItem(page, -1);

    assert.deepEqual(engine.appendedConsoleText, ['name "NewName"\n']);
  });

  void test('accepting a changed color sends the color command', () => {
    const { engine, getMainPage, getProfilePage } = createMainMenuRig(HellwaveMenu);
    engine.SetCvar('_cl_color', '0');

    pressItem(getMainPage(), 1);
    const page = getProfilePage();
    itemAt(page, 1, ColorPicker).setValue(3); // vest
    itemAt(page, 2, ColorPicker).setValue(7); // pants
    pressItem(page, -1);

    assert.deepEqual(engine.appendedConsoleText, ['color 3 7\n']);
  });

  void test('Escape pops back without confirming the profile or sending anything', () => {
    const { engine, calls, getMainPage, getProfilePage } = createMainMenuRig(HellwaveMenu);
    engine.SetCvar('_cl_name', 'Grunt99');

    pressItem(getMainPage(), 1);
    itemAt(getProfilePage(), 0, Textbox).value = 'NewName';
    getProfilePage().handleInput(K.ESCAPE);

    assert.equal(calls.pop, 1);
    assert.deepEqual(engine.appendedConsoleText, []);
    assert.equal(engine.GetCvar('hw_profile_confirmed').string, '0');
  });

  void test('attaches the header bitmap font to the Accept/Continue button once it finishes loading', async () => {
    const { getMainPage, getProfilePage } = createMainMenuRig(HellwaveMenu);

    pressItem(getMainPage(), 1);
    const page = getProfilePage();

    assert.equal(itemAt(page, -1, Action).font, null);

    await Promise.resolve(); // flush LoadBitmapFont's promise

    assert.equal(itemAt(page, -1, Action).font?.charset, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  });

  void test('layout.hitTest resolves the Name/Vest/Pants fields and the bottom-right Accept button', async () => {
    const { getMainPage, getProfilePage } = createMainMenuRig(HellwaveMenu);

    pressItem(getMainPage(), 1); // standalone, "Accept" label
    const page = getProfilePage();

    await Promise.resolve(); // flush LoadBitmapFont's promise, so Accept is measured with the real font

    // Field rows no longer care about px (the whole row width is clickable) -- only py matters.
    assert.equal(layoutOf(page).hitTest(page.items, 999, 110), 0); // Name field row (startY=100, 24 tall)
    assert.equal(layoutOf(page).hitTest(page.items, 999, 132), 1); // Vest field row (24 tall)
    assert.equal(layoutOf(page).hitTest(page.items, 999, 160), 2); // Pants field row (36 tall)
    // "Accept" is 6 chars * 14px (mock cellWidth) = 84px wide, right/bottom edges at (632, 352).
    assert.equal(layoutOf(page).hitTest(page.items, 590, 344), 3); // Accept, bottom-right corner
    assert.equal(layoutOf(page).hitTest(page.items, 500, 344), null); // left of Accept's column
    assert.equal(layoutOf(page).hitTest(page.items, 590, 50), null); // above Accept's row
  });
});
