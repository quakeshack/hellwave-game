import type { ClientEdictHandlerClass } from '../../../id1/helper/ClientEdictHandlerRegistry.ts';
import { clientEdictHandlerClasses as id1ClientEdictHandlerClasses } from '../../../id1/client/entity/ClientEdictHandlers.ts';

import { MuzzleFlashClientEdictHandler } from './MuzzleFlash.ts';
import { HellwavePlayerClientEdictHandler } from './Player.ts';

/**
 * The client edict handlers of this game: id1's, with its player handler replaced by one that also makes the flash sprite, and the flash itself.
 */
export const clientEdictHandlerClasses: readonly ClientEdictHandlerClass[] = [
  ...id1ClientEdictHandlerClasses.filter((handlerClass) => handlerClass.classname !== HellwavePlayerClientEdictHandler.classname),
  HellwavePlayerClientEdictHandler,
  MuzzleFlashClientEdictHandler,
];
