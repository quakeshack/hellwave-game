
import sampleBSpline from '../../../shared/BSpline.mjs';

import { ClientGameAPI as id1ClientGameAPI } from '../../id1/main.mjs';
import { clientEvent, clientEventName } from '../Defs.mjs';

import HellwaveHUD from './HUD.mjs';

export class ClientGameAPI extends id1ClientGameAPI {
  /** current player’s data */
  clientdata = {
    health: 100,
    armorvalue: 0,
    armortype: 0,
    items: 0,

    ammo_shells: 0,
    ammo_nails: 0,
    ammo_rockets: 0,
    ammo_cells: 0,

    weapon: 0,
    weaponframe: 0,

    money: 0,
    buyzone: 0,

    spectating: false,
  };

  sfx = {
    phase: {
      quiet: /** @type {import('source/shared/GameInterfaces').SFX[]} */ ([]),
      normal: /** @type {import('source/shared/GameInterfaces').SFX[]} */ ([]),
    },
  };

  _newHUD() {
    return new HellwaveHUD(this, this.engine);
  }

  _updateViewModel() {
    if (this.clientdata.spectating) {
      this.viewmodel.visible = false;
      return;
    }

    super._updateViewModel();
  }

  init() {
    super.init();

    this.engine.eventBus.subscribe(clientEventName(clientEvent.NAV_HINT), (...waypoints) => {
      const points = sampleBSpline(waypoints, Math.min(100, waypoints.length * 2));

      for (let i = 1; i < points.length; i++) {
        this.engine.RocketTrail(points[i - 1], points[i], 7);
      }
    });

    // preload sounds
    this.sfx.phase.quiet.push(this.engine.LoadSound('phase/quiet.mp3'));
    this.sfx.phase.normal.push(this.engine.LoadSound('phase/normal-1.mp3'));
    this.sfx.phase.normal.push(this.engine.LoadSound('phase/normal-2.mp3'));
  }

  static IsServerCompatible(version) {
    return version[0] === 1 && version[1] === 0 && version[2] === 0;
  }
};
