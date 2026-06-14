// Random three-word names for new worktrees (adjective-color-animal, e.g.
// "calm-amber-falcon"). Short curated lists keep names pronounceable; with
// 20^3 combinations collisions are unlikely and git rejects duplicates anyway.

const ADJECTIVES = [
  'calm', 'bold', 'swift', 'quiet', 'brave', 'eager', 'fuzzy', 'merry',
  'noble', 'proud', 'rapid', 'sunny', 'vivid', 'witty', 'zesty', 'lucky',
  'mellow', 'crisp', 'gentle', 'steady'
]

const COLORS = [
  'amber', 'azure', 'coral', 'crimson', 'golden', 'indigo', 'ivory', 'jade',
  'lilac', 'maroon', 'ochre', 'olive', 'pearl', 'ruby', 'rust', 'sage',
  'scarlet', 'silver', 'teal', 'violet'
]

const ANIMALS = [
  'falcon', 'otter', 'badger', 'condor', 'dingo', 'gecko', 'heron', 'ibex',
  'jackal', 'koala', 'lemur', 'lynx', 'marmot', 'osprey', 'panda', 'quokka',
  'raven', 'stoat', 'toucan', 'wombat'
]

const pick = (words: string[]): string => words[Math.floor(Math.random() * words.length)]

/**
 * ------------------------------------------------
 * Generate a random three-word worktree name.
 * @returns {string} Name like "calm-amber-falcon".
 */
export function randomWorktreeName(): string {
  return `${pick(ADJECTIVES)}-${pick(COLORS)}-${pick(ANIMALS)}`
}
