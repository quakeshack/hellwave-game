/**
 * One map the New Game screen offers.
 */
export interface MapDetails {
  readonly name: string;
  readonly label: string;
  /** Upper bound the per-map settings screen allows for the player count. */
  readonly maxplayers: number;
  /** Screenshot paths, the first one is used by the map-picker card and the session list. */
  readonly pictures: readonly string[];
}

/**
 * The curated maps Hellwave offers, owned by the client because only its menus and the singleplayer
 * start handler read them.
 */
export const MAP_CATALOG: readonly MapDetails[] = Object.freeze([
  { name: 'hw_doom', label: 'Doomed computer station', maxplayers: 4, pictures: ['maps/hw_doom.jpg'] },
  { name: 'hw_e1m2', label: 'Castle of the damned', maxplayers: 4, pictures: ['maps/hw_e1m2.jpg'] },
]);
