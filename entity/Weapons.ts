import Vector from '../../../shared/Vector.ts';

import type BaseEntity from '../../id1/entity/BaseEntity.ts';
import { Superspike as Id1Superspike } from '../../id1/entity/Weapons.ts';
import { entity, serializable } from '../../id1/helper/MiscHelpers.ts';

import { channel } from '../Defs.ts';

const ricochetSounds = [
  'weapons/ric1.wav',
  'weapons/ric2.wav',
  'weapons/ric3.wav',
] as const;

@entity
export class HellwaveSuperspike extends Id1Superspike {
  @serializable private _direction = new Vector();
  @serializable private _richochetsLeft = 3;

  protected override _handleImpact(touchedByEntity: BaseEntity): void {
    // Make sure we get removed if we stop moving for whatever reason.
    this._scheduleThink(this.game.time + 0.1, () => {
      if (this.velocity.len() < 1) {
        this.remove();
      }
    });

    if (!touchedByEntity.isActor() && this._richochetsLeft > 0) {
      const target = this._direction.copy().multiply(16.0).add(this.origin);
      const trace = this.traceline(this.origin, target, true);

      if (trace.solid && trace.plane !== null) {
        const normal = trace.plane.normal;
        const dot = this._direction.dot(normal);

        if (Math.abs(dot) < Math.sin(22.5 * Math.PI / 180)) {
          const reflected = this._direction.copy().subtract(normal.copy().multiply(2 * dot));
          this._direction.set(reflected);

          this.angles.set(this._direction.toAngles());
          this.velocity.set(this._direction).multiply(this.speed || 1000);

          const soundName = ricochetSounds[Math.floor(Math.random() * ricochetSounds.length)];
          console.assert(soundName !== undefined, 'Ricochet sound selection requires a sound name');
          this.startSound(channel.CHAN_WEAPON, soundName!);

          this._richochetsLeft -= 1;
          return;
        }
      }
    }

    super._handleImpact(touchedByEntity);
  }

  override spawn(): void {
    super.spawn();
    this._direction.set(this.velocity).normalize();
  }
}
