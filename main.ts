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
};

export {
  identification,
  ServerGameAPI,
  ClientGameAPI,
};
