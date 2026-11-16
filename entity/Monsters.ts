import ZombieMonster from '../../id1/entity/monster/Zombie.ts';
import type Vector from '../../../shared/Vector.ts';

import DogMonsterEntity from '../../id1/entity/monster/Dog.ts';
import { serializableObject, serializable } from '../../id1/helper/MiscHelpers.ts';

import { hull } from '../Defs.ts';
import type BaseEntity from '../../id1/entity/BaseEntity.ts';
import { ArmySoldierMonster } from '../../id1/entity/monster/Soldier.ts';
import type BaseMonster from '../../id1/entity/monster/BaseMonster.ts';
import { WeaponShotgun } from './Weapons.ts';

/**
 * How long after a spawn a monster is certain to have had its first think, in which the AI sets the monster up and puts it at
 * rest (stand state, `pausetime` forever). The first think comes within 0.6 seconds.
 */
const FIRST_THINK_DONE_DELAY = 1.0;

/**
 * Sends a monster that was spawned with an enemy after that enemy, for good. `hunt()` right after the spawn is not enough: the
 * first think of a monster undoes it, and since it already has the player as its enemy it never looks for him again. So the order
 * is given once more when the first think is certainly over. It is a scheduled think of the monster, so it survives a savegame
 * (and, being serialized as source, it names nothing but `this`).
 * @param monster A freshly spawned monster that has its enemy set.
 */
export function orderHuntAfterSpawn(monster: BaseMonster): void {
  monster._scheduleThink(monster.game.time + FIRST_THINK_DONE_DELAY, function (this: BaseMonster): void {
    const target = this.enemy;

    if (this.health > 0 && target !== null && target.classname === 'player') {
      this.hunt(target);
    }
  }, 'hellwave-hunt');
}

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
    const shotgun = this.engine.SpawnEntity<WeaponShotgun>(WeaponShotgun.classname, {
      origin: this.origin.copy(),
      regeneration_time: 0,
      remove_after: 120,
    })?.entity;

    console.assert(shotgun instanceof WeaponShotgun);

    shotgun!.toss();
  }
}
