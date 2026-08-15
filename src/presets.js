/**
 * Static, client-side game presets (US-15, ARCHITECTURE.md D10). Purely
 * a convenience lookup that prefills the existing deck-config (US-3) and
 * cards-per-player (US-4) fields — no server/state concept, and no
 * enforcement: the host can still change any value before dealing.
 *
 * `usesMiddle` flags presets whose usual play depends on the face-down/
 * private middle-zone mechanics (D7/D8, US-12/13/14) — informational for
 * the UI (e.g. to explain why Hold'em plays differently), not a hard gate.
 */
export const PRESETS = [
  {
    name: 'War',
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 26,
    usesMiddle: false,
  },
  {
    name: 'Gin Rummy',
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 10,
    usesMiddle: false,
  },
  {
    name: 'Hearts',
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 13,
    usesMiddle: false,
  },
  {
    name: 'Poker — 5 Card Draw',
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 5,
    usesMiddle: false,
  },
  {
    name: "Texas Hold'em",
    numDecks: 1,
    jokers: 0,
    cardsPerPlayer: 2,
    usesMiddle: true,
  },
];
