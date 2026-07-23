import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { K } from '../../../../../shared/Keys.ts';
import Vector from '../../../../../shared/Vector.ts';
import { createMainMenuRig } from './fixtures.mjs';

await import('../../../../id1/GameAPI.ts');

const { default: HellwaveMenu } = await import('../../../client/menu/Menu.ts');
const { default: MenuCommon } = await import('../../../client/menu/MenuCommon.ts');

void describe('Hellwave new game map picker', () => {
  void test('registers \'hellwave_newgame\' with one card per curated map', () => {
    const { getNewGamePage } = createMainMenuRig(HellwaveMenu);
    const page = getNewGamePage();

    assert.equal(page.title, 'Select a Map');
    assert.deepEqual(page.items.map((item) => item.label), ['Doomed computer station', 'Castle of the damned']);
  });

  void test('layout.hitTest resolves each card and ignores the gap between them', () => {
    const { getNewGamePage } = createMainMenuRig(HellwaveMenu);
    const page = getNewGamePage();

    // Cards: hw_doom at x=[165,305), hw_e1m2 at x=[335,475), both y starting at 70.
    assert.equal(page.layout.hitTest(page.items, 200, 150), 0);
    assert.equal(page.layout.hitTest(page.items, 400, 150), 1);
    assert.equal(page.layout.hitTest(page.items, 320, 150), null); // the gap
    assert.equal(page.layout.hitTest(page.items, 200, 900), null); // below every card
  });

  void test('draws a hover border around only the focused card', () => {
    const { engine, getNewGamePage } = createMainMenuRig(HellwaveMenu);
    const page = getNewGamePage();
    const hoverColor = new Vector(0.733, 0.733, 0.733);

    engine.drawRects.length = 0;
    page.layout.draw(page.items, 0);

    assert.equal(engine.drawRects.length, 4); // one hollow border: top/bottom/left/right
    for (const rect of engine.drawRects) {
      assert.deepEqual(rect.color, hoverColor);
    }

    engine.drawRects.length = 0;
    page.layout.draw(page.items, 1); // second card focused instead

    assert.equal(engine.drawRects.length, 4); // still exactly one border, now around the other card
  });

  void test('long map labels wrap onto a second line instead of overflowing into the next card', () => {
    // Regression test: a real playtest found "Doomed computer station"/"Castle of the damned"
    // (both longer than one card is wide, 17 chars/line at CARD_WIDTH=140) rendering as a single
    // line and running together across the gap into the neighboring card's label. Both curated
    // labels need wrapping -- assert the hit region grows to cover the wrapped second label line
    // (y=228, between the single-line bottom at 224 and the correct two-line bottom at 232)
    // instead of stopping short after only the first line's height.
    const { getNewGamePage } = createMainMenuRig(HellwaveMenu);
    const page = getNewGamePage();

    for (const item of page.items) {
      assert.ok(item.label.length > 15, `expected "${item.label}" to actually need wrapping for this test to mean anything`);
    }

    assert.equal(page.layout.hitTest(page.items, 200, 228), 0);
    assert.equal(page.layout.hitTest(page.items, 400, 228), 1);
  });

  void test('MenuCommon.wrapLabel never splits a word, even when the label is much longer than two card widths', () => {
    const maxChars = 17; // CARD_WIDTH / 8, kept in sync manually (private to NewGameMenu.ts)
    const longLabel = 'A hypothetical label far too long to fit on a single card line';

    const wrapped = MenuCommon.wrapLabel(longLabel, maxChars);

    assert.equal(wrapped.length, 2);
    assert.ok(wrapped[0].length <= maxChars);
    assert.equal(wrapped.join(' '), longLabel);
  });

  void test('MenuCommon.centerX centers content within a container and never goes left of it', () => {
    assert.equal(MenuCommon.centerX(100, 140, 80), 130); // (140-80)/2 = 30 inset
    assert.equal(MenuCommon.centerX(100, 140, 140), 100); // exact fit, no inset
    assert.equal(MenuCommon.centerX(100, 140, 200), 100); // content wider than container -- clamped, not negative
  });

  void test('picking a map opens the per-map settings screen instead of starting it directly', () => {
    const { calls, getNewGamePage, getNewGameSettingsPage } = createMainMenuRig(HellwaveMenu);

    getNewGamePage().items[0].action(); // hw_doom

    assert.deepEqual(calls.push, ['hellwave_newgame_settings']);
    assert.equal(calls.forceClose, 0);
    assert.deepEqual(calls.startMultiplayerGame, []);
    assert.ok(getNewGameSettingsPage());
  });

  void test('Escape pops back to the previous page', () => {
    const { calls, getNewGamePage } = createMainMenuRig(HellwaveMenu);

    getNewGamePage().handleInput(K.ESCAPE);

    assert.equal(calls.pop, 1);
  });
});
