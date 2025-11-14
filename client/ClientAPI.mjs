
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

  _newHUD() {
    return new HellwaveHUD(this, this.engine);
  }

  init() {
    super.init();

    this.engine.eventBus.subscribe(clientEventName(clientEvent.NAV_HINT), (...waypoints) => {
      const points = sampleBSpline(waypoints, 100);

      for (let i = 1; i < points.length; i++) {
        this.engine.RocketTrail(points[i - 1], points[i], 1);
      }
    });
  }

  static IsServerCompatible(version) {
    return version[0] === 1 && version[1] === 0 && version[2] === 0;
  }
};
