import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type BaseMonster from '../../id1/entity/monster/BaseMonster.ts';

await import('../../id1/GameAPI.ts');

const { orderHuntAfterSpawn } = await import('../entity/Monsters.ts');

type ThinkCallback = (this: BaseMonster) => void;

interface ScheduledOrder {
  readonly time: number;
  readonly callback: ThinkCallback;
  readonly identifier: string | null;
}

/**
 * @param state What the monster is like when the order comes.
 * @returns A monster-shaped stand-in, what it was told to hunt, and what it scheduled.
 */
function createMonster(state: { health?: number; enemy?: { classname: string } | null } = {}) {
  const orders: ScheduledOrder[] = [];
  const hunted: unknown[] = [];
  const monster = {
    health: state.health ?? 30,
    enemy: state.enemy === undefined ? { classname: 'player' } : state.enemy,
    game: { time: 100 },
    _scheduleThink(time: number, callback: ThinkCallback, identifier: string | null = null) {
      orders.push({ time, callback, identifier });
    },
    hunt(target: unknown) {
      hunted.push(target);
    },
  } as unknown as BaseMonster;

  return { monster, orders, hunted };
}

/**
 * Runs the scheduled order the way a loaded savegame does: from its source text, in a scope that has nothing of this module.
 * @param order The scheduled think.
 * @param monster What it runs on.
 */
function runRestored(order: ScheduledOrder, monster: BaseMonster): void {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- this is how a savegame restores a scheduled think
  const restored = new Function(`return (${order.callback.toString()});`)() as ThinkCallback;
  restored.call(monster);
}

void describe('orderHuntAfterSpawn', () => {
  void test('orders the hunt once more after the monster has had its first think, which is what undoes the first order', () => {
    const { monster, orders, hunted } = createMonster();

    orderHuntAfterSpawn(monster);

    assert.equal(orders.length, 1);
    assert.ok(orders[0]!.time > 100.6, 'later than the 0.6 seconds in which the first think happens');
    assert.equal(hunted.length, 0, 'nothing happens before then');

    orders[0]!.callback.call(monster);

    assert.deepEqual(hunted, [monster.enemy]);
  });

  void test('is one think with a name, so that a second order replaces it instead of adding to it', () => {
    const { monster, orders } = createMonster();

    orderHuntAfterSpawn(monster);

    assert.equal(orders[0]!.identifier, 'hellwave-hunt');
  });

  void test('still works after a savegame: the think is stored as source text and names nothing but the monster', () => {
    const { monster, orders, hunted } = createMonster();
    orderHuntAfterSpawn(monster);

    runRestored(orders[0]!, monster);

    assert.deepEqual(hunted, [monster.enemy]);
  });

  void test('does not drag a dead monster, or one that has no enemy or fights another monster, into a hunt', () => {
    const cases: Array<[string, Parameters<typeof createMonster>[0]]> = [
      ['dead', { health: 0 }],
      ['no enemy', { enemy: null }],
      ['fighting a monster', { enemy: { classname: 'monster_dog' } }],
    ];

    for (const [name, state] of cases) {
      const { monster, orders, hunted } = createMonster(state);
      orderHuntAfterSpawn(monster);

      orders[0]!.callback.call(monster);

      assert.equal(hunted.length, 0, name);
    }
  });
});

