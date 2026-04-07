
import sampleBSpline from '../../../shared/BSpline.ts';

import { ClientGameAPI as id1ClientGameAPI } from '../../id1/main.ts';
import { clientEvent, clientEventName } from '../Defs.mjs';
import { ServerGameAPI } from '../GameAPI.mjs';

import HellwaveHUD from './HUD.mjs';

// const keyCommands = Object.freeze({
//   'invite': 'Invite your friends to the game',
//   'impulse 20': 'Drop Q100 in a backpack',
//   'impulse 21': 'Open buy menu',
//   'impulse 10': 'Select previous weapon',
//   'impulse 12': 'Select next weapon',
//   'screenshot': 'Take a screenshot',
//   'toggleconsole': 'Open the console',
// });

class StartGameHandler {
  constructor(engineAPI) {
    /** @type {import('../../../shared/GameInterfaces').ClientEngineAPI} */
    this.engine = engineAPI;
  }

  startSingleplayerGame() {
    const maps = ServerGameAPI.GetMapList().map((map) => map.name);

    console.assert(maps.length > 0, 'MUST HAVE MAPS LOL');

    // just start a random map, since the singleplayer mode is not the focus of the mod
    this.engine.AppendConsoleText(`map ${maps[Math.floor(Math.random() * maps.length)]}\n`);
  }

  startMultiplayerGame(/** @type {string} */ mapname) {
    this.engine.AppendConsoleText(`
      deathmatch 0
      coop 1
      samelevel 1
      maxplayers 4
      map "${mapname}"
    `);
  }
}

export class ClientGameAPI extends id1ClientGameAPI {
  /** current player’s data */
  clientdata = {
    // Original fields
    health: 100,
    armorvalue: 0,
    armortype: 0,
    items: 0,

    ammo_shells: 0,
    ammo_nails: 0,
    ammo_rockets: 0,
    ammo_cells: 0,

    effects: 0,

    // Hellwave-specific fields
    weapon: 0,
    weaponframe: 0,

    money: 0,
    buyzone: 0,

    spectating: false,
  };

  sfx = {
    phase: {
      quiet: /** @type {import('../../../shared/GameInterfaces').SFX[]} */ ([]),
      normal: /** @type {import('../../../shared/GameInterfaces').SFX[]} */ ([]),
    },
  };

  static loadingScreen = /** @type {import('../../../shared/GameInterfaces').GLTexture} */(null);

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

  static Init(engineAPI) {
    super.Init(engineAPI);

    engineAPI.LoadPicFromFile('gfx/loadingscreen.png').then((/** @type {import('../../../shared/GameInterfaces').GLTexture} */ tex) => {
      tex.lockTextureMode('GL_LINEAR');
      this.loadingScreen = tex;
    }).catch(() => {
      engineAPI.ConsoleWarning('Couldn\'t load loading screen picture.\n');
    });

    // make sure we enable a few engine features
    engineAPI.GetCvar('r_bloom').set(true);
    engineAPI.GetCvar('r_bloom_downsample').set(8);
    engineAPI.GetCvar('r_bloom_dlight_strength').set(0.33);
    engineAPI.GetCvar('r_bloom_sky_strength').set(0.33);
    engineAPI.GetCvar('r_bloom_specular_strength').set(0.33);
    engineAPI.GetCvar('r_bloom_strength').set(1);
  }

  static Shutdown(engineAPI) {
    super.Shutdown(engineAPI);

    if (this.loadingScreen) {
      this.loadingScreen.free();
      this.loadingScreen = null;
    }
  }

  drawLoading() {
    const { width, height } = this.engine.VID;

    if (!ClientGameAPI.loadingScreen) {
      return;
    }

    this.engine.DrawPic((width - ClientGameAPI.loadingScreen.width * 0.8) / 2, (height - ClientGameAPI.loadingScreen.height * 0.8) / 2, ClientGameAPI.loadingScreen, 0.8);

    // const rows = /** @type {string[]} */([]);

    // for (const [command, description] of Object.entries(keyCommands)) {
    //   const key = this.engine.Key.getKeyForBinding(command);

    //   if (key) {
    //     rows.push(`${`[${key.toUpperCase()}]`.padEnd(3).padStart(3)} ${description}`);
    //   }
    // }

    // rows.push('');
    // rows.push('Thank you for playing hellwave!');

    // for (let i = 0; i < rows.length; i++) {
    //   const row = rows[i];
    //   const textWidth = row.length * 16;
    //   this.engine.DrawString((width - textWidth) / 2, height * 0.75 + i * 16, row, 2.0);
    // }
  }

  static GetStartGameInterface(engineAPI) {
    return new StartGameHandler(engineAPI);
  }

  static IsServerCompatible(version) {
    return version[0] === 1 && version[1] === 0 && version[2] === 0;
  }
};
