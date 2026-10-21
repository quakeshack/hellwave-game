import type { ClientGameAPI } from '../../client/ClientAPI.ts';
import { createMockSound, type MockClientEngine, type MockSound } from '../../../id1/test/client/fixtures.ts';

export type HellwaveClientdata = ClientGameAPI['clientdata'];

/** The game a Hellwave HUD is built around, typed as the client game API with the sounds a test inspects. */
export type HellwaveGameStub = ClientGameAPI & {
  readonly sfx: { readonly phase: { readonly quiet: MockSound[]; readonly normal: MockSound[] } };
};

/**
 * Create a minimal Hellwave clientdata map for tests.
 * @param overrides Override values.
 * @returns Mock clientdata.
 */
export function createClientdata(overrides: Partial<HellwaveClientdata> = {}): HellwaveClientdata {
  return {
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
    effects: 0,
    money: 0,
    buyzone: 0,
    spectating: false,
    ...overrides,
  };
}

/**
 * Create a minimal Hellwave game object for HUD tests.
 * @param engine Mock engine.
 * @param overrides Override values.
 * @returns Mock client game.
 */
export function createHellwaveGame(engine: MockClientEngine, overrides: { clientdata?: HellwaveClientdata } = {}): HellwaveGameStub {
  // The HUD reads the clientdata, the engine, the server info and the phase sounds of the game.
  return {
    clientdata: createClientdata(),
    engine,
    serverInfo: {
      hostname: 'Hellwave Test Server',
      coop: '1',
    },
    sfx: {
      phase: {
        quiet: [createMockSound('phase/quiet.mp3')],
        normal: [createMockSound('phase/normal-1.mp3')],
      },
    },
    ...overrides,
  } as unknown as HellwaveGameStub;
}
