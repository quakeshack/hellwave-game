import Vector from '../../../shared/Vector.ts';
import { Superspike as id1Superspike } from '../../id1/entity/Weapons.ts';
import { channel } from '../Defs.mjs';

const ricochetSounds = /** @type {ReadonlyArray<string>} */ ([
  'weapons/ric1.wav',
  'weapons/ric2.wav',
  'weapons/ric3.wav',
]);

export class HellwaveSuperspike extends id1Superspike {
  /** @type {Vector} */
  _direction = new Vector();

  /** @type {number} */
  _richochetsLeft = 3;

  _declareFields() {
    super._declareFields();

    this._serializer.startFields();
    this._direction = new Vector();
    this._richochetsLeft = 3;
    this._serializer.endFields();
  }

  /** @param {import('../../id1/entity/BaseEntity.ts').default} touchedByEntity */
  _handleImpact(touchedByEntity) {
    // make sure we get removed if we stop moving for whatever reason
    this._scheduleThink(this.game.time + 0.1, () => {
      if (this.velocity.len() < 1) {
        this.remove();
      }
    });

    if (!touchedByEntity.isActor() && this._richochetsLeft > 0) {
      const target = this._direction.copy().multiply(16.0).add(this.origin);
      const trace = this.traceline(this.origin, target, true);

      if (trace.solid && trace.plane) {
        const n = trace.plane.normal;
        const d = this._direction;

        const dot = d.dot(n);

        if (Math.abs(dot) < Math.sin(22.5 * Math.PI / 180)) {
          const reflected = d.copy().subtract(n.copy().multiply(2 * dot));
          d.set(reflected);

          this.angles.set(d.toAngles());
          this.velocity.set(d).multiply(this.speed || 1000);

          this.startSound(channel.CHAN_WEAPON, ricochetSounds[Math.floor(Math.random() * ricochetSounds.length)]);

          this._richochetsLeft--;
          return;
        }
      }
    }

    super._handleImpact(touchedByEntity);
  }

  spawn() {
    super.spawn();
    this._direction.set(this.velocity).normalize();
  }
};
