import { PlayerClientEdictHandler } from '../../../id1/client/entity/Player.ts';

import { MuzzleFlashClientEdictHandler } from './MuzzleFlash.ts';

/** The least time between two flash sprites of one player, in seconds, so that a burst of shots read in one frame does not pile them up. */
const MIN_TIME_BETWEEN_FLASHES = 0.04;

/**
 * id1's player handler (the powerup glow, the light of a muzzle flash, the bend of the back), plus a flash sprite on the muzzle of the weapon
 * the player holds, every time the player fires.
 */
export class HellwavePlayerClientEdictHandler extends PlayerClientEdictHandler {
  static override readonly classname = 'player';

  #lastFlashTime = -Infinity;

  override emit(): void {
    super.emit();

    const time = this.engine.CL.time;

    // one sprite per shot, from the engine's count of the shots it read, not from sampling the bit: two datagrams in one frame set and clear it before this runs
    if (this._newShots > 0 && time - this.#lastFlashTime >= MIN_TIME_BETWEEN_FLASHES) {
      this.#spawnFlash();
      this.#lastFlashTime = time;
    }
  }

  /**
   * Puts a flash on the weapon in the player's hand: the entity attached to the player that is a weapon with a muzzle.
   */
  #spawnFlash(): void {
    for (const attached of this.engine.GetEntities((entity) => entity.attachmentParent === this.clientEdict && !entity.free)) {
      if (MuzzleFlashClientEdictHandler.spawnOn(this.engine, attached)) {
        return;
      }
    }
  }
}
