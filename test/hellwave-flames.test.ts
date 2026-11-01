import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createInertEdict, createInertEngineApi, createInertGameApi } from '../../../../test/support/entityMocks.ts';

await import('../../id1/GameAPI.ts');

const { ServerGameAPI } = await import('../GameAPI.ts');
const { HellwaveYellowLargeFlameLightEntity, HellwaveYellowSmallFlameLightEntity } = await import('../entity/Misc.ts');
const { SmallWalltorchLightEntity, WhiteSmallFlameLightEntity } = await import('../../id1/entity/Misc.ts');
const { effect } = await import('../../id1/Defs.ts');

type FlameClass = typeof HellwaveYellowLargeFlameLightEntity | typeof HellwaveYellowSmallFlameLightEntity;

interface FlameRun {
  readonly precachedModels: string[];
  readonly models: string[];
  readonly madeStatic: number;
  readonly effects: number;
}

/**
 * Precaches and spawns a flame the way a map does.
 * @param flameClass The flame entity class to run.
 * @returns What the flame asked of the engine and what it ended up with.
 */
function runFlame(flameClass: FlameClass): FlameRun {
  const precachedModels: string[] = [];
  const models: string[] = [];
  let madeStatic = 0;

  const edict = createInertEdict();
  edict.setModel = (modelName: string): boolean => {
    models.push(modelName);
    return true;
  };
  edict.makeStatic = (): void => {
    madeStatic++;
  };

  const engine = createInertEngineApi({
    PrecacheModel(modelName: string) {
      precachedModels.push(modelName);
    },
  });

  const flame = new flameClass(edict, createInertGameApi({}, engine));
  edict.entity = flame;
  flame.precacheEntity();
  flame.spawn();

  return { precachedModels, models, madeStatic, effects: flame.effects };
}

void describe('Hellwave yellow flames', () => {
  void test('replace id1\'s yellow flames in the registry and keep their classnames', () => {
    assert.equal(ServerGameAPI._entityRegistry.get('light_flame_large_yellow'), HellwaveYellowLargeFlameLightEntity);
    assert.equal(ServerGameAPI._entityRegistry.get('light_flame_small_yellow'), HellwaveYellowSmallFlameLightEntity);
  });

  void test('leave the white flame and the wall torch to id1', () => {
    assert.equal(ServerGameAPI._entityRegistry.get('light_flame_small_white'), WhiteSmallFlameLightEntity);
    assert.equal(ServerGameAPI._entityRegistry.get('light_torch_small_walltorch'), SmallWalltorchLightEntity);
  });

  void test('the large flame is the fire.gif sprite, without the alias models', () => {
    const run = runFlame(HellwaveYellowLargeFlameLightEntity);

    assert.deepEqual(run.precachedModels, ['gfx/fire.gif']);
    assert.deepEqual(run.models, ['gfx/fire.gif']);
  });

  void test('the small flame is the fire-small.gif sprite, without the alias models', () => {
    const run = runFlame(HellwaveYellowSmallFlameLightEntity);

    assert.deepEqual(run.precachedModels, ['gfx/fire-small.gif']);
    assert.deepEqual(run.models, ['gfx/fire-small.gif']);
  });

  void test('the flame becomes a static decoration that is fullbright, as the torches of id1', () => {
    for (const flameClass of [HellwaveYellowLargeFlameLightEntity, HellwaveYellowSmallFlameLightEntity]) {
      const run = runFlame(flameClass);

      assert.equal(run.madeStatic, 1);
      assert.equal(run.effects & effect.EF_FULLBRIGHT, effect.EF_FULLBRIGHT);
    }
  });
});
