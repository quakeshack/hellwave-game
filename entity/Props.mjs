import { BaseWallEntity } from '../../id1/entity/Misc.mjs';
import { moveType, solid } from '../Defs.mjs';

/**
 * QUAKED func_wall (0 .5 .8) ?
 * This is just a solid wall if not inhibitted
 * Brings additional show/hide functionality.
 */
export class WallEntity extends BaseWallEntity {
  static classname = 'func_wall';

  _declareFields() {
    super._declareFields();

    this._serializer.startFields();
    this._shownModel = null;
    this._serializer.endFields();
  }

  spawn() {
    this._shownModel = this.model;

    this.show();
  }

  show() {
    this.solid = solid.SOLID_BSP;
    this.movetype = moveType.MOVETYPE_PUSH;

    this.setModel(this._shownModel);
  }

  hide() {
    this.solid = solid.SOLID_NOT;
    this.movetype = moveType.MOVETYPE_NONE;

    this.unsetModel();
  }
};
