import type { ClientDamageEvent, ClientEngineAPI, Cvar, GLTexture, SFX, StartGameInterface, ViewInput, ViewResult } from '../../../shared/GameInterfaces.ts';

import sampleBSpline from '../../../shared/BSpline.ts';
import type Vector from '../../../shared/Vector.ts';

import { ClientGameAPI as Id1ClientGameAPI, type Id1Clientdata } from '../../id1/client/ClientAPI.ts';
import type { Id1MenuOptions } from '../../id1/client/Menu.ts';
import { clientEvent, clientEventName } from '../Defs.ts';
import { ServerGameAPI } from '../GameAPI.ts';
import { MAP_CATALOG } from './MapCatalog.ts';

import HellwaveHUD from './HUD.ts';
import HellwaveMenu from './menu/Menu.ts';
import { generateRandomPlayerName } from './NameGenerator.ts';
import { clientEvents } from '../Events.ts';

interface HellwaveClientdata extends Id1Clientdata {
  money: number;
  buyzone: -1 | 0 | 1;
  spectating: boolean;
}

interface HellwavePhaseSfx {
  quiet: SFX[];
  normal: SFX[];
}

interface HellwaveClientSfx {
  phase: HellwavePhaseSfx;
}

/** The most a hit lifts the view in Hellwave's own first-person view, in degrees. */
const VIEW_KICK_MAX = 10;

/** How fast that kick falls off, in degrees per second. */
const VIEW_KICK_DECAY = 12;

class StartGameHandler implements StartGameInterface {
  readonly engine: ClientEngineAPI;

  constructor(engineAPI: ClientEngineAPI) {
    this.engine = engineAPI;
  }

  startSingleplayerGame(): void {
    const maps = MAP_CATALOG.map((map) => map.name);

    console.assert(maps.length > 0, 'Hellwave must expose at least one map');

    if (maps.length === 0) {
      return;
    }

    // Just start a random map, since the singleplayer mode is not the focus of the mod.
    this.engine.AppendConsoleText(`map ${maps[Math.floor(Math.random() * maps.length)]}\n`);
  }

  startMultiplayerGame(mapname: string): void {
    const maxplayers = this.engine.GetCvar('hw_maxplayers')?.value ?? 4;

    this.engine.AppendConsoleText(`
      deathmatch 0
      coop 1
      samelevel 1
      maxplayers ${maxplayers}
      map "${mapname}"
    `);
  }
}

export class ClientGameAPI extends Id1ClientGameAPI {
  /** The client handlers of the game, which the server precaches for. */
  static override _clientEdictHandlerRegistry = ServerGameAPI._clientEdictHandlerRegistry;

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

  /**
   * `hw_view`: 0 is the engine's first-person view, 1 is Hellwave's own, a prototype of `ClientGameInterface.calcView`
   * (a steady eye: no bob, no roll into a strafe, no idle sway, no smoothing of steps, and a hit lifts the view).
   */
  static viewVariant: Cvar | null = null;

  /** How far a recent hit lifts the view, in degrees, falling off at `VIEW_KICK_DECAY` degrees per second. */
  #viewKick = 0;

  protected override _newHUD(): HellwaveHUD {
    return new HellwaveHUD(this, this.engine);
  }

  protected static override _getHUDClass(): typeof HellwaveHUD {
    return HellwaveHUD;
  }

  // Hellwave's HellwaveMenu.Init (called below in Init) fully replaces id1's classic front end
  // with its own main/profile/map-picker pages -- only the shared options/keys/quit/alert pages
  // (still built regardless) are ever reused. See plans/hellwave-menu-asset-cleanup.md.
  protected static override _getMenuInitOptions(): Id1MenuOptions {
    return { classicFrontend: false };
  }

  protected override _updateViewModel(): void {
    if (this.clientdata.spectating) {
      this.viewmodel.visible = false;
      this.viewmodel.model = null;
      return;
    }

    super._updateViewModel();
  }

  /**
   * Hellwave's first-person view when `hw_view` is 1, the engine's own otherwise. The point of this method is to be
   * the proof that the interface is enough: everything it needs is in `input`, and the result is the eye and the
   * weapon, with nothing of the engine's internals touched.
   */
  calcView(input: ViewInput, result: ViewResult): void {
    this.#viewKick = Math.max(0, this.#viewKick - input.frametime * VIEW_KICK_DECAY);

    if ((ClientGameAPI.viewVariant?.value ?? 0) === 0) {
      this.engine.View.calculateDefault(input, result);
      return;
    }

    const { origin, viewangles, punchangle, viewheight } = input;

    result.vieworg.setTo(origin[0], origin[1], origin[2] + viewheight);
    result.viewangles.setTo(
      viewangles[0] - this.#viewKick + punchangle[0],
      viewangles[1] + punchangle[1],
      viewangles[2] + punchangle[2],
    );
    result.weaponOrigin.setTo(origin[0], origin[1], origin[2] + viewheight);
    result.weaponAngles.setTo(-viewangles[0], viewangles[1], viewangles[2]);
  }

  override init(): void {
    super.init();

    // a hit lifts the view for a moment, the amount of the damage that got through, not more than 10 degrees
    clientEvents(this.engine).subscribe('client.damage', (event: ClientDamageEvent): void => {
      this.#viewKick = Math.min(VIEW_KICK_MAX, this.#viewKick + event.damageReceived * 0.15);
    });

    clientEvents(this.engine).subscribe(clientEventName(clientEvent.NAV_HINT), (...waypoints: readonly Vector[]): void => {
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

    this.viewVariant = engineAPI.RegisterCvar('hw_view', '0');

    HellwaveMenu.Init(engineAPI);

    // Give first-time players a real name instead of the shared "player" cvar default. Runs
    // once: _cl_name is ARCHIVE-flagged, so it's never literally "player" again after this.
    if (engineAPI.GetCvar('_cl_name')?.string === 'player') {
      engineAPI.SetCvar('_cl_name', generateRandomPlayerName());
    }

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
