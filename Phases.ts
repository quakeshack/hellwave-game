/**
 * Hellwave round phases.
 */
export enum HellwavePhase {
  /** waiting for players */
  waiting = 'waiting',
  /** players can spawn, no monsters */
  quiet = 'quiet',
  /** monsters spawn normally */
  normal = 'normal',
  /** monsters spawn more frequently */
  action = 'action',
  /** game over, waiting for intermission */
  gameover = 'gameover',
  /** boss fight round */
  bossfight = 'bossfight',
  /** all rounds complete, waiting for intermission */
  victory = 'victory',
}

/**
 * Labels to display for each phase in the HUD.
 */
export const phaseLabels: Record<HellwavePhase, string> = {
  [HellwavePhase.waiting]: 'Waiting for players',
  [HellwavePhase.quiet]: 'Quiet',
  [HellwavePhase.normal]: 'Normal',
  [HellwavePhase.action]: 'Action!',
  [HellwavePhase.gameover]: 'Game over...',
  [HellwavePhase.bossfight]: 'Boss fight!',
  [HellwavePhase.victory]: 'YOU WON!',
};

export { HellwavePhase as phases };
