import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

await import('../../id1/GameAPI.ts');

const { channel, clientEvent, formatMoney, fromBuyImpulse, items, toBuyImpulse } = await import('../Defs.ts');
const hellwavePlayerModule = await import('../entity/Player.ts');

const { buyMenuItems } = hellwavePlayerModule;
const HellwavePlayer = hellwavePlayerModule.default;

/**
 * Create a minimal player-shaped stub that can exercise HellwavePlayer methods.
 * @returns {object} Player-like stub.
 */
function createPlayerStub() {
  const sounds = [];
  const dispatchedEvents = [];
  const player = Object.assign(Object.create(HellwavePlayer.prototype), {
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
    startSound(soundChannel, soundName) {
      sounds.push({ soundChannel, soundName });
    },
    dispatchEvent(eventType, ...args) {
      dispatchedEvents.push([eventType, ...args]);
    },
    centerPrint(message) {
      assert.fail(`Unexpected centerPrint: ${message}`);
    },
    consolePrint(message) {
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
    assert.ok(Array.isArray(HellwavePlayer.serializableFields));
    assert.ok(Object.isFrozen(HellwavePlayer.serializableFields));
    assert.deepEqual(HellwavePlayer.serializableFields, ['money', 'buyzone', 'buyzone_time', 'spectating']);
    assert.equal(buyMenuItems[2].cost, 200);
  });

  void test('buys shell bundles through the buy menu and dispatches a money update plus purchase feedback', () => {
    const { player, sounds, dispatchedEvents } = createPlayerStub();

    player._buyMenuPurchase(2);

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

    player._buyMenuPurchase(2);

    assert.equal(player.money, 0);
    assert.deepEqual(dispatchedEvents, [
      [clientEvent.BUY_MESSAGE, `you need ${formatMoney(buyMenuItems[2].cost)} to buy that!`],
    ]);
  });

  void test('dispatches buy-message feedback instead of centerPrint when the item is already owned', () => {
    const { player, dispatchedEvents } = createPlayerStub();
    player.armorvalue = 200; // item 1 (Heavy Armor) is only available below 200

    player._buyMenuPurchase(1);

    assert.equal(player.money, 500);
    assert.deepEqual(dispatchedEvents, [
      [clientEvent.BUY_MESSAGE, `you already have ${buyMenuItems[1].label}`],
    ]);
  });

  void test('refuses a purchase when the player is not physically in a buyzone, regardless of what the client UI shows', () => {
    const { player, dispatchedEvents } = createPlayerStub();
    player.buyzone = 0;

    player._buyMenuPurchase(2);

    assert.equal(player.money, 500);
    assert.deepEqual(dispatchedEvents, [
      [clientEvent.BUY_MESSAGE, 'you are not in a buyzone!'],
    ]);
  });

  void test('_handleImpulseCommands routes a buy-range impulse to a purchase and resets impulse', () => {
    const { player, dispatchedEvents } = createPlayerStub();
    player.impulse = toBuyImpulse(2);

    player._handleImpulseCommands();

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
