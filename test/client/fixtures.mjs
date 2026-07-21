import { createMockSound } from '../../../id1/test/client/fixtures.ts';

/**
 * Create a minimal Hellwave clientdata map for tests.
 * @param {object} overrides Override values.
 * @returns {object} Mock clientdata.
 */
export function createClientdata(overrides = {}) {
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
 * @param {object} engine Mock engine.
 * @param {object} overrides Override values.
 * @returns {object} Mock client game.
 */
export function createHellwaveGame(engine, overrides = {}) {
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
  };
}
