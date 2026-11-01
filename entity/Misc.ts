import { serializableObject } from '../../id1/helper/MiscHelpers.ts';
import { TorchLightEntity } from '../../id1/entity/Misc.ts';

// TODO:
// - misc_scripting_round_trigger
//   - triggers other things by targetname on round reached

/**
 * A torch flame drawn as an animated sprite instead of an alias model.
 * The sprite's origin, scale and blending come from the settings file next to the image.
 */
@serializableObject
abstract class FlameSpriteLightEntity extends TorchLightEntity {
  /**
   * @returns The image of the flame, played as a sprite model.
   */
  protected abstract _flameSprite(): string;

  protected override _precache(): void {
    this.engine.PrecacheModel(this._flameSprite());
    this.engine.PrecacheSound('ambience/fire1.wav');
  }

  override spawn(): void {
    this.setModel(this._flameSprite());
    super.spawn();
  }
}

/**
 * QUAKED light_flame_large_yellow (0 1 0) (-10 -10 -12) (12 12 18)
 * Large yellow flame ball, replacing Quake's alias model with a GIF sprite.
 */
@serializableObject
export class HellwaveYellowLargeFlameLightEntity extends FlameSpriteLightEntity {
  static classname = 'light_flame_large_yellow';

  protected override _flameSprite(): string {
    return 'gfx/fire.gif';
  }
}

/**
 * QUAKED light_flame_small_yellow (0 1 0) (-8 -8 -8) (8 8 8) START_OFF
 * Small yellow flame ball, replacing Quake's alias model with a GIF sprite.
 */
@serializableObject
export class HellwaveYellowSmallFlameLightEntity extends FlameSpriteLightEntity {
  static classname = 'light_flame_small_yellow';

  protected override _flameSprite(): string {
    return 'gfx/fire-small.gif';
  }
}
