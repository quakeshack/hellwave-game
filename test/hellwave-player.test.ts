import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { serializableFieldsOf } from '../../../../test/support/serialization.ts';

await import('../../id1/GameAPI.ts');

const { channel, clientEvent, formatMoney, fromBuyImpulse, items, toBuyImpulse } = await import('../Defs.ts');
const hellwavePlayerModule = await import('../entity/Player.ts');

const { buyMenuItems } = hellwavePlayerModule;
const HellwavePlayer = hellwavePlayerModule.default;

/** A player that lets a test run the protected steps of a purchase and of the impulse handling. */
class TestPlayer extends HellwavePlayer {
  buyMenuPurchase(itemId: keyof typeof buyMenuItems): void {
    this._buyMenuPurchase(itemId);
  }

  handleImpulseCommands(): void {
    this._handleImpulseCommands();
  }
}

/**
 * Create a minimal player-shaped stub that can exercise HellwavePlayer methods.
 * @returns Player-like stub.
 */
function createPlayerStub() {
  const sounds: Array<{ soundChannel: number; soundName: string }> = [];
  const dispatchedEvents: unknown[][] = [];
  // A real player needs an edict and a whole game; the purchase reads the members below.
  const player = Object.create(TestPlayer.prototype) as TestPlayer;

  Object.assign(player, {
    money: 500,
    buyzone: 1, // physically inside a buyzone, per the purely server-side check
    ammo_shells: 0,
    ammo_nails: 0,
    ammo_rockets: 0,
    ammo_cells: 0,
    items: 0,
    weapon: 0,
    impulse: 0,
    game: {
      deathmatch: false,
    },
    startSound(soundChannel: number, soundName: string) {
      sounds.push({ soundChannel, soundName });
    },
    dispatchEvent(eventType: number, ...args: unknown[]) {
      dispatchedEvents.push([eventType, ...args]);
    },
    centerPrint(message: string) {
      assert.fail(`Unexpected centerPrint: ${message}`);
    },
    consolePrint(message: string) {
      assert.fail(`Unexpected consolePrint: ${message}`);
    },
    setWeapon() {
      assert.fail('Unexpected weapon switch during shell purchase');
    },
  });

  return { player, sounds, dispatchedEvents };
}

void describe('HellwavePlayer', () => {
  void test('serializableFields is a frozen array from @entity', () => {
    const fields = serializableFieldsOf(HellwavePlayer);

    assert.ok(Array.isArray(fields));
    assert.ok(Object.isFrozen(fields));
    assert.deepEqual(fields, ['money', 'buyzone', 'buyzone_time', 'spectating']);
    assert.equal(buyMenuItems[2].cost, 200);
  });

  void test('buys shell bundles through the buy menu and dispatches a money update plus purchase feedback', () => {
    const { player, sounds, dispatchedEvents } = createPlayerStub();

    player.buyMenuPurchase(2);

    assert.equal(player.money, 300);
    assert.equal(player.ammo_shells, 20);
    assert.equal(player.items & (items.IT_SHOTGUN | items.IT_SHELLS), items.IT_SHOTGUN | items.IT_SHELLS);
    assert.deepEqual(sounds, [{ soundChannel: channel.CHAN_WEAPON, soundName: 'weapons/lock4.wav' }]);
    assert.deepEqual(dispatchedEvents, [
      [clientEvent.MONEY_UPDATE, 300],
      [clientEvent.BUY_MESSAGE, `bought ${buyMenuItems[2].label}!`],
    ]);
  });

  void test('dispatches buy-message feedback instead of centerPrint when funds are insufficient', () => {
    const { player, dispatchedEvents } = createPlayerStub();
    player.money = 0;

    player.buyMenuPurchase(2);

    assert.equal(player.money, 0);
    assert.deepEqual(dispatchedEvents, [
      [clientEvent.BUY_MESSAGE, `you need ${formatMoney(buyMenuItems[2].cost)} to buy that!`],
    ]);
  });

  void test('dispatches buy-message feedback instead of centerPrint when the item is already owned', () => {
    const { player, dispatchedEvents } = createPlayerStub();
    player.armorvalue = 200; // item 1 (Heavy Armor) is only available below 200

    player.buyMenuPurchase(1);

    assert.equal(player.money, 500);
    assert.deepEqual(dispatchedEvents, [
      [clientEvent.BUY_MESSAGE, `you already have ${buyMenuItems[1].label}`],
    ]);
  });

  void test('refuses a purchase when the player is not physically in a buyzone, regardless of what the client UI shows', () => {
    const { player, dispatchedEvents } = createPlayerStub();
    player.buyzone = 0;

    player.buyMenuPurchase(2);

    assert.equal(player.money, 500);
    assert.deepEqual(dispatchedEvents, [
      [clientEvent.BUY_MESSAGE, 'you are not in a buyzone!'],
    ]);
  });

  void test('_handleImpulseCommands routes a buy-range impulse to a purchase and resets impulse', () => {
    const { player, dispatchedEvents } = createPlayerStub();
    player.impulse = toBuyImpulse(2);

    player.handleImpulseCommands();

    assert.equal(player.impulse, 0);
    assert.equal(player.money, 300);
    assert.deepEqual(dispatchedEvents, [
      [clientEvent.MONEY_UPDATE, 300],
      [clientEvent.BUY_MESSAGE, `bought ${buyMenuItems[2].label}!`],
    ]);
  });
});

void describe('toBuyImpulse / fromBuyImpulse', () => {
  void test('round-trips every catalog item id through the buy-impulse range', () => {
    for (let itemId = 1; itemId <= 9; itemId++) {
      assert.equal(fromBuyImpulse(toBuyImpulse(itemId)), itemId);
    }
  });

  void test('keeps the buy-impulse range disjoint from the 1-9 weapon-select range', () => {
    for (let itemId = 1; itemId <= 9; itemId++) {
      assert.ok(toBuyImpulse(itemId) > 9);
    }
  });

  void test('rejects impulses outside the buy-menu range', () => {
    assert.equal(fromBuyImpulse(21), null); // the old open/close toggle impulse, now unused
    assert.equal(fromBuyImpulse(5), null); // a plain weapon-select impulse
    assert.equal(fromBuyImpulse(101), null); // the money cheat impulse
  });
});
