import type { PlayerEntity } from '../../id1/entity/Player.ts';
import type { ServerGameAPI } from '../GameAPI.ts';

import { BackpackEntity as Id1BackpackEntity, HealthItemEntity as Id1HealthItemEntity } from '../../id1/entity/Items.ts';
import { serializableObject, serializable } from '../../id1/helper/MiscHelpers.ts';

import { formatMoney, solid } from '../Defs.ts';
import { phases } from '../Phases.ts';

@serializableObject
export class HellwaveBackpackEntity extends Id1BackpackEntity {
  @serializable money = 0;

  /**
   * @returns Collected item labels.
   */
  protected override _collectItems(playerEntity: PlayerEntity): string[] {
    const collectedItems = super._collectItems(playerEntity);

    if (this.money > 0) {
      collectedItems.push(formatMoney(this.money));
    }

    return collectedItems;
  }
}

/**
 * This version of a megahealth only starts decaying when the quiet phase ended.
 */
@serializableObject
export class HellwaveHealthItemEntity extends Id1HealthItemEntity {
  protected override _afterTouch(playerEntity: PlayerEntity): void {
    this.solid = solid.SOLID_NOT;
    this._model_original = this.model;
    this.model = null;
    this.owner = playerEntity;

    this._sub?.useTargets(playerEntity);

    if ((this.spawnflags & HellwaveHealthItemEntity.H_MEGA) !== 0) {
      const game = this.game as ServerGameAPI;

      let decayTime = this.game.time;

      if (game.manager.phase === phases.quiet) {
        decayTime = game.manager.phase_ending_time;
      }

      this._scheduleThink(decayTime + 5.0, () => { this._takeHealth(); });
      return;
    }

    this.remove();
  }
}
