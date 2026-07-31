const ADJECTIVES: readonly string[] = [
  'Cursed', 'Doomed', 'Infernal', 'Wretched', 'Savage', 'Grim', 'Vile', 'Blighted', 'Feral', 'Hollow',
];

const NOUNS: readonly string[] = [
  'Slayer', 'Wraith', 'Reaper', 'Warden', 'Marine', 'Ghoul', 'Warlock', 'Hunter', 'Revenant', 'Butcher',
];

/**
 * Generate a random Quake-flavored player name (e.g. "CursedSlayer73"), used to replace the
 * shared "player" cvar default the first time a client boots.
 * @returns A randomly generated player name.
 */
export function generateRandomPlayerName(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const number = Math.floor(Math.random() * 100);

  return `${adjective}${noun}${number}`;
}
