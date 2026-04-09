/**
 * Hellwave round phases.
 */
export const phases = Object.freeze({
  /** waiting for players */
  waiting: 'waiting',
  /** players can spawn, no monsters */
  quiet: 'quiet',
  /** monsters spawn normally */
  normal: 'normal',
  /** monsters spawn more frequently */
  action: 'action',
  /** game over, waiting for intermission */
  gameover: 'gameover',
  /** all rounds complete, waiting for intermission */
  victory: 'victory',
} as const);

export type HellwavePhase = (typeof phases)[keyof typeof phases];
