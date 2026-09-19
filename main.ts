import type { GameModuleIdentification, GameModuleInterface } from '../../shared/GameInterfaces.ts';

import { gameCapabilities } from '../../shared/Defs.ts';
import { ServerGameAPI } from './GameAPI.ts';
import { ClientGameAPI } from './client/ClientAPI.ts';

const identification = {
  name: 'Hellwave',
  author: 'chrisnew',
  version: [1, 0, 0],
  capabilities: [
    gameCapabilities.CAP_HUD_INCLUDES_CROSSHAIR,
  ],
} satisfies GameModuleIdentification;

export {
  identification,
  ServerGameAPI,
  ClientGameAPI,
};

// Compile-time check only: fails the typecheck when this module drifts from the engine's contract.
({ identification, ServerGameAPI, ClientGameAPI }) satisfies GameModuleInterface;
