import type { ClientEdict, ClientEngineAPI, ServerEngineAPI } from '../../../../shared/GameInterfaces.ts';

import { BaseClientEdictHandler, type ClientSpawnParameters } from '../../../../shared/ClientEdict.ts';

/** The tag of a held weapon model where the flash goes: the end of its barrel. */
const FLASH_TAG = 'tag_flash';

/** How many variations of each flash there are (`<family>_1.gif` to `<family>_3.gif`), so that shots do not all look alike. */
const VARIANTS = 3;

/**
 * Which flash a held weapon gets: the family of GIFs in `gfx/muzzle_flash/`, by the name of the weapon's model. The axe has none.
 * A weapon model that is not listed gets no flash sprite, only the light.
 */
export const muzzleFlashFamilies: Readonly<Record<string, string>> = {
  'progs/p_shot1.iqm': 'star_shotgun',
  'progs/p_shot.iqm': 'star_shotgun',
  'progs/p_nail.iqm': 'star_smg',
  'progs/p_nail2.iqm': 'star_rifle',
  'progs/p_rock.iqm': 'star_rifle',
  'progs/p_rock2.iqm': 'star_shotgun',
  'progs/p_light.iqm': 'energy_plasma',
};

/**
 * @param family A flash family of `muzzleFlashFamilies`.
 * @param variant 1 to `VARIANTS`.
 * @returns The sprite's model name.
 */
function flashModelName(family: string, variant: number): string {
  return `gfx/muzzle_flash/${family}_${variant}.gif`;
}

/**
 * The flash sprite at the muzzle of a weapon: a short additive animation on the weapon's `tag_flash`, which plays once and removes
 * itself. It is made by `HellwavePlayerClientEdictHandler` when a player fires, and exists on this client only.
 */
export class MuzzleFlashClientEdictHandler extends BaseClientEdictHandler {
  static readonly classname = 'hellwave_muzzleflash';

  #dieTime = 0.0;

  static override _precache(engineAPI: ServerEngineAPI): void {
    for (const family of new Set(Object.values(muzzleFlashFamilies))) {
      for (let variant = 1; variant <= VARIANTS; variant++) {
        engineAPI.PrecacheModel(flashModelName(family, variant));
      }
    }
  }

  /**
   * Puts a flash on a weapon.
   * @param engine The client engine API.
   * @param weapon The entity of the weapon in the player's hand.
   * @returns `false` when the weapon's model has no flash.
   */
  static spawnOn(engine: ClientEngineAPI, weapon: ClientEdict): boolean {
    const family = weapon.model === null ? undefined : muzzleFlashFamilies[weapon.model.name];

    if (family === undefined) {
      return false;
    }

    const modelName = flashModelName(family, 1 + Math.floor(Math.random() * VARIANTS));
    const flash = engine.SpawnClientEntity(MuzzleFlashClientEdictHandler.classname, { persistent: false });

    flash.model = engine.ModForName(modelName);
    // a fresh entity has non-finite origin and angles; here they are the offset from the tag, and the roll turns the picture
    flash.origin.clear();
    flash.angles.setTo(0.0, 0.0, Math.random() * 360.0);
    flash.setAttachment(weapon, FLASH_TAG);
    flash.spawn({ duration: engine.GetSequenceDuration(modelName, 0) });

    return true;
  }

  override spawn(parameters?: ClientSpawnParameters): void {
    const duration = parameters?.duration;

    this.#dieTime = this.engine.CL.time + (typeof duration === 'number' && Number.isFinite(duration) ? duration : 0.25);
  }

  override think(): void {
    if (this.engine.CL.time >= this.#dieTime) {
      this.remove();
    }
  }
}
