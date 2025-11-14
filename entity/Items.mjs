import { BackpackEntity as id1BackpackEntity } from '../../id1/entity/Items.mjs';

export class BackpackEntity extends id1BackpackEntity {
  _declareFields() {
    super._declareFields();

    this._serializer.startFields();

    this.money = 0;

    this._serializer.endFields();
  }

  _collectItems(playerEntity) {
    const items = super._collectItems(playerEntity);

    if (this.money > 0) {
      items.push(`Q${this.money.toFixed(0)}`);
    }

    return items;
  }
};
