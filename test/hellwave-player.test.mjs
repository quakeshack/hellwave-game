import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

await import('../../id1/GameAPI.ts');

const { channel, clientEvent, items } = await import('../Defs.ts');
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
    ammo_shells: 0,
    ammo_nails: 0,
    ammo_rockets: 0,
    ammo_cells: 0,
    items: 0,
    weapon: 0,
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

  void test('buys shell bundles through the buy menu and dispatches a money update', () => {
    const { player, sounds, dispatchedEvents } = createPlayerStub();

    player._buyMenuPurchase(2);

    assert.equal(player.money, 300);
    assert.equal(player.ammo_shells, 20);
    assert.equal(player.items & (items.IT_SHOTGUN | items.IT_SHELLS), items.IT_SHOTGUN | items.IT_SHELLS);
    assert.deepEqual(sounds, [{ soundChannel: channel.CHAN_WEAPON, soundName: 'weapons/lock4.wav' }]);
    assert.deepEqual(dispatchedEvents, [[clientEvent.MONEY_UPDATE, 300]]);
  });
});
