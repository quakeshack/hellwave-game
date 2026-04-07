import { BackpackEntity as id1BackpackEntity, HealthItemEntity as id1HealthItemEntity } from '../../id1/entity/Items.ts';
import { formatMoney, solid } from '../Defs.mjs';
import { ServerGameAPI } from '../GameAPI.mjs';
import { phases } from '../GameManager.mjs';
import HellwavePlayer from './Player.mjs';

export class HellwaveBackpackEntity extends id1BackpackEntity {
  /** @type {number} */
  money = 0;

  _declareFields() {
    super._declareFields();

    this._serializer.startFields();

    this.money = 0;

    this._serializer.endFields();
  }

  /**
   * @param {HellwavePlayer} playerEntity
   * @returns {string[]} Collected item labels.
   */
  _collectItems(playerEntity) {
    const items = super._collectItems(playerEntity);

    if (this.money > 0) {
      items.push(formatMoney(this.money));
    }

    return items;
  }
};

// this version of a mega health only starts decaying when the quiet phase ended
export class HellwaveHealthItemEntity extends id1HealthItemEntity {
  _afterTouch(/** @type {HellwavePlayer} */ playerEntity) {
    this.solid = solid.SOLID_NOT;
    this._model_original = this.model;
    this.model = null;
    this.owner = playerEntity;

    // trigger all connected actions
    this._sub?.useTargets(playerEntity);

    // chipping away the player’s health when mega is running
    if (this.spawnflags & HellwaveHealthItemEntity.H_MEGA) {
      const game = /** @type {ServerGameAPI} */(this.game);

      let decayTime = this.game.time;

      if (game.manager.phase === phases.quiet) {
        decayTime = game.manager.phase_ending_time;
      }

      this._scheduleThink(decayTime + 5.0, () => this._takeHealth());
    } else {
      this.remove();
    }
  }
};
