import ZombieMonster from '../../id1/entity/monster/Zombie.ts';
import type Vector from '../../../shared/Vector.ts';

import DogMonsterEntity from '../../id1/entity/monster/Dog.ts';
import { serializableObject, irandom, serializable } from '../../id1/helper/MiscHelpers.ts';

import { hull } from '../Defs.ts';
import type BaseEntity from '../../id1/entity/BaseEntity.ts';
import { ArmySoldierMonster } from '../../id1/entity/monster/Soldier.ts';
import BaseMonster from '../../id1/entity/monster/BaseMonster.ts';

@serializableObject
export class HellwaveDogMonsterEntity extends DogMonsterEntity {
  // make dogs smaller so that they fit through narrow corridors better
  static _size: [Vector, Vector] = [
    hull[1][0].copy(),
    hull[1][1].copy(),
  ];
}

@serializableObject
export class HellwaveZombieMonsterEntity extends ZombieMonster {
  @serializable actualHealth = ZombieMonster._health * 3; // forcing zombies to die, not to tumble all the time

  override thinkPain(attackerEntity: BaseEntity, damageAmount: number): void {
    this.actualHealth -= damageAmount;

    if (this.actualHealth <= 0) {
      this._gib(true);
      return;
    }

    super.thinkPain(attackerEntity, damageAmount);
  }
}

@serializableObject
export class HellwaveSoldierMonsterEntity extends ArmySoldierMonster {
  override _dropBackpack(): void {
    BaseMonster.prototype._dropBackpack.call(this, { ammo_shells: irandom(5, 25) });
  }
}
