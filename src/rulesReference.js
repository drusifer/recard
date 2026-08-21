/**
 * Static in-app rules reference (US-18, ARCHITECTURE.md D10). Purely
 * informational — Recard never enforces any of this, per the sharpened
 * Vision in docs/PRD.md ("primitives, not rules"). One consistent shape
 * per entry (goal/setup/turns) so the reference reads the same game to
 * game, per Smith's Gate 1 AC.
 */
export const RULES_REFERENCE = {
  War: {
    goal: 'Win all the cards.',
    setup: 'Split the deck evenly between two players, face-down, no one looks at their cards.',
    turns:
      'Both players flip their top card at the same time; higher rank wins both cards. Tied cards trigger a "war": each player plays 3 cards face-down and 1 face-up, and the higher face-up card wins the whole pile.',
  },
  'Gin Rummy': {
    goal: 'Group your hand into sets (same rank) and runs (consecutive same-suit) with the least leftover ("deadwood") points.',
    setup: 'Deal 10 cards to each of 2 players. Remaining deck is the draw pile; turn the top card face-up to start the discard pile.',
    turns:
      'Each turn: draw one card (from the deck or the top of the discard pile), then discard one card. Knock when your deadwood is low enough to end the round and compare hands.',
  },
  Hearts: {
    goal: 'Score the fewest points — avoid taking Hearts (1 point each) and the Queen of Spades (13 points).',
    setup: 'Deal the full deck evenly among 4 players (13 cards each).',
    turns:
      'Player left of the dealer leads; everyone must follow suit if possible. Highest card of the led suit wins the trick and leads next. Hearts can\'t be led until "broken" (played on another suit).',
  },
  'Poker — 5 Card Draw': {
    goal: 'Make the best 5-card poker hand, or get everyone else to fold.',
    setup: 'Deal 5 cards to each player, face-down and private.',
    turns:
      'A betting round, then each player may discard and draw new cards to replace them, then a final betting round and a showdown (best hand shown wins).',
  },
  "Texas Hold'em": {
    goal: 'Make the best 5-card hand using your 2 private cards plus 5 shared community cards.',
    setup:
      'Deal 2 private cards to each player. Reserve 5 shared cards face-down in the middle for later (the "flop," "turn," and "river").',
    turns:
      'A betting round, then reveal 3 shared cards (the flop) and bet again, reveal 1 more (the turn) and bet, reveal the last (the river) and bet, then showdown.',
  },
  Pinochle: {
    goal: 'Score points by melding card combinations and by winning tricks that contain counting cards (Aces, Tens, Kings), racing to a target score across hands.',
    setup:
      'Uses a 48-card pinochle deck (two of each 9/10/J/Q/K/A per suit, no 2-8, no jokers). Deal 12 cards to each of 4 players (2 partnerships).',
    turns:
      'Players bid for the right to name trump, then lay down and score their melds face-up. Play then proceeds in tricks: follow suit if you can, otherwise you may trump; highest card of the led suit (or highest trump) wins the trick and leads next.',
  },
};
