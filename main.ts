import type { GameModuleIdentification, GameModuleInterface } from '../../shared/GameInterfaces.ts';

import { ServerGameAPI } from './GameAPI.ts';
import { ClientGameAPI } from './client/ClientAPI.ts';

const identification = {
  name: 'Hellwave',
  author: 'chrisnew',
  version: [1, 0, 0],
  capabilities: [],
} satisfies GameModuleIdentification;

export {
  identification,
  ServerGameAPI,
  ClientGameAPI,
};

// Compile-time check only: fails the typecheck when this module drifts from the engine's contract.
({ identification, ServerGameAPI, ClientGameAPI }) satisfies GameModuleInterface;
