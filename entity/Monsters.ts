import type Vector from '../../../shared/Vector.ts';

import DogMonsterEntity from '../../id1/entity/monster/Dog.ts';
import { entity } from '../../id1/helper/MiscHelpers.ts';

import { hull } from '../Defs.ts';

@entity
export class HellwaveDogMonsterEntity extends DogMonsterEntity {
  static _size: [Vector, Vector] = [
    hull[1][0].copy(),
    hull[1][1].copy(),
  ];
}
