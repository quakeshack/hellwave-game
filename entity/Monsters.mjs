import DogMonsterEntity from '../../id1/entity/monster/Dog.mjs';
import { hull } from '../Defs.mjs';

export class HellwaveDogMonsterEntity extends DogMonsterEntity {
  static _size = hull[1].map((v) => v.copy());
};
