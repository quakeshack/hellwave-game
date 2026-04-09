import type { ClientEngineAPI, GLTexture, SFX, StartGameInterface } from '../../../shared/GameInterfaces.ts';

import sampleBSpline from '../../../shared/BSpline.ts';
import type Vector from '../../../shared/Vector.ts';

import { ClientGameAPI as Id1ClientGameAPI, type Id1Clientdata } from '../../id1/client/ClientAPI.ts';
import { clientEvent, clientEventName } from '../Defs.ts';
import { ServerGameAPI } from '../GameAPI.ts';

import HellwaveHUD from './HUD.ts';

interface HellwaveClientdata extends Id1Clientdata {
  money: number;
  buyzone: -1 | 0 | 1 | 2;
  spectating: boolean;
}

interface HellwavePhaseSfx {
  quiet: SFX[];
  normal: SFX[];
}

interface HellwaveClientSfx {
  phase: HellwavePhaseSfx;
}

class StartGameHandler implements StartGameInterface {
  readonly engine: ClientEngineAPI;

  constructor(engineAPI: ClientEngineAPI) {
    this.engine = engineAPI;
  }

  startSingleplayerGame(): void {
    const mapList = ServerGameAPI.GetMapList();

    console.assert(mapList !== null, 'Hellwave server map list must exist');

    if (mapList === null) {
      return;
    }

    const maps = mapList.map((map) => map.name);

    console.assert(maps.length > 0, 'Hellwave must expose at least one map');

    if (maps.length === 0) {
      return;
    }

    // Just start a random map, since the singleplayer mode is not the focus of the mod.
    this.engine.AppendConsoleText(`map ${maps[Math.floor(Math.random() * maps.length)]}\n`);
  }

  startMultiplayerGame(mapname: string): void {
    this.engine.AppendConsoleText(`
      deathmatch 0
      coop 1
      samelevel 1
      maxplayers 4
      map "${mapname}"
    `);
  }
}

export class ClientGameAPI extends Id1ClientGameAPI {
  /** Current player data mirrored from the server. */
  override clientdata: HellwaveClientdata = {
    health: 100,
    armorvalue: 0,
    armortype: 0,
    items: 0,

    ammo_shells: 0,
    ammo_nails: 0,
    ammo_rockets: 0,
    ammo_cells: 0,

    effects: 0,

    weapon: 0,
    weaponframe: 0,

    money: 0,
    buyzone: 0,

    spectating: false,
  };

  sfx: HellwaveClientSfx = {
    phase: {
      quiet: [],
      normal: [],
    },
  };

  static loadingScreen: GLTexture | null = null;

  protected override _newHUD(): HellwaveHUD {
    return new HellwaveHUD(this, this.engine);
  }

  protected override _updateViewModel(): void {
    if (this.clientdata.spectating) {
      this.viewmodel.visible = false;
      this.viewmodel.model = null;
      return;
    }

    super._updateViewModel();
  }

  override init(): void {
    super.init();

    this.engine.eventBus.subscribe(clientEventName(clientEvent.NAV_HINT), (...waypoints: readonly Vector[]): void => {
      const points = sampleBSpline([...waypoints], Math.min(100, waypoints.length * 2));

      for (let i = 1; i < points.length; i++) {
        this.engine.RocketTrail(points[i - 1], points[i], 7);
      }
    });

    // Preload phase ambience.
    this.sfx.phase.quiet.push(this.engine.LoadSound('phase/quiet.mp3'));
    this.sfx.phase.normal.push(this.engine.LoadSound('phase/normal-1.mp3'));
    this.sfx.phase.normal.push(this.engine.LoadSound('phase/normal-2.mp3'));
  }

  static override Init(engineAPI: ClientEngineAPI): void {
    super.Init(engineAPI);

    void engineAPI.LoadPicFromFile('gfx/loadingscreen.png').then((texture: GLTexture): void => {
      texture.lockTextureMode('GL_LINEAR');
      this.loadingScreen = texture;
    }).catch((): void => {
      engineAPI.ConsoleWarning('Couldn\'t load loading screen picture.\n');
    });

    // Make sure we enable a few engine features.
    engineAPI.GetCvar('r_bloom')!.set(true);
    engineAPI.GetCvar('r_bloom_downsample')!.set(8);
    engineAPI.GetCvar('r_bloom_dlight_strength')!.set(0.33);
    engineAPI.GetCvar('r_bloom_sky_strength')!.set(0.33);
    engineAPI.GetCvar('r_bloom_specular_strength')!.set(0.33);
    engineAPI.GetCvar('r_bloom_strength')!.set(1);
  }

  static override Shutdown(engineAPI: ClientEngineAPI): void {
    super.Shutdown(engineAPI);

    if (this.loadingScreen !== null) {
      this.loadingScreen.free();
      this.loadingScreen = null;
    }
  }

  override drawLoading(): void {
    const { width, height } = this.engine.VID;
    const loadingScreen = ClientGameAPI.loadingScreen;

    if (loadingScreen === null) {
      return;
    }

    this.engine.DrawPic(
      (width - loadingScreen.width * 0.8) / 2,
      (height - loadingScreen.height * 0.8) / 2,
      loadingScreen,
      0.8,
    );
  }

  static override GetStartGameInterface(engineAPI: ClientEngineAPI): StartGameHandler {
    return new StartGameHandler(engineAPI);
  }

  static override IsServerCompatible(version: number[]): boolean {
    return version[0] === 1 && version[1] === 0 && version[2] === 0;
  }
}
