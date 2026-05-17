import { InfoNotNullEntity } from '@/game/id1/entity/Misc';
import { BossMonster } from '../../id1/entity/monster/Boss.ts';
import { serializable, serializableObject } from '../../id1/helper/MiscHelpers.ts';


@serializableObject
export class HellwaveBossMonsterEntity extends BossMonster {
}

/**
 * QUAKED info_boss_marker (0 0.5 0) (-4 -4 -4) (4 4 4)
 * This entity is used to mark the spawn point of the boss monster.
 *
 * "classname_boss" - the classname of the boss monster to spawn at this marker.
 * "use_after_spawn" - whether to trigger the boss monster's use function after spawning it.
 */
@serializableObject
export class HellwaveBossMonsterSpawnMarker extends InfoNotNullEntity {
  static classname = 'info_boss_marker';

  @serializable classname_boss = 'monster_boss';
  @serializable use_after_spawn: 0 | 1 = 1;

  get useAfterSpawn(): boolean {
    return this.use_after_spawn === 1;
  }

  get bossClassname(): string {
    return this.classname_boss;
  }

  // TODO: add use cascade
}
