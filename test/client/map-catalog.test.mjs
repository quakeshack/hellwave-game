import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { MAP_CATALOG } from '../../client/MapCatalog.ts';

void describe('Hellwave MAP_CATALOG', () => {
  void test('each curated map carries its screenshot for the map-select screen', () => {
    assert.deepEqual(MAP_CATALOG.map((map) => [map.name, map.pictures]), [
      ['hw_doom', ['maps/hw_doom.jpg']],
      ['hw_e1m2', ['maps/hw_e1m2.jpg']],
    ]);
  });

  void test('every map allows at least one player', () => {
    for (const map of MAP_CATALOG) {
      assert.ok(map.maxplayers >= 1, `${map.name} maxplayers`);
    }
  });
});
