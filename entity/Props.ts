import { BaseWallEntity } from '../../id1/entity/Misc.ts';
import { entity, serializable } from '../../id1/helper/MiscHelpers.ts';

import { moveType, solid } from '../Defs.ts';

/**
 * QUAKED func_wall (0 .5 .8) ?
 * This is just a solid wall if not inhibitted.
 * Brings additional show/hide functionality.
 */
@entity
export class WallEntity extends BaseWallEntity {
  static classname = 'func_wall';

  @serializable _shownModel: string | null = null;

  override spawn(): void {
    this._shownModel = this.model;

    this.show();
  }

  show(): void {
    this.solid = solid.SOLID_BSP;
    this.movetype = moveType.MOVETYPE_PUSH;

    this.setModel(this._shownModel);
  }

  hide(): void {
    this.solid = solid.SOLID_NOT;
    this.movetype = moveType.MOVETYPE_NONE;

    this.unsetModel();
  }
}
