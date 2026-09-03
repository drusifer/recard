/**
 * Static in-app rules reference (US-18, ARCHITECTURE.md D10). Purely
 * informational — Recard never enforces any of this, per the sharpened
 * Vision in docs/PRD.md ("primitives, not rules"). One consistent shape
 * per entry (goal/setup/turns) so the reference reads the same game to
 * game, per Smith's Gate 1 AC.
 */
export const RULES_REFERENCE = {
  'Recard the Gathering': {
    goal: 'Reduce your opponent from 20 life to 0 using creatures and spells.',
    setup:
      'Two players. Each picks one of the fifteen decks on the table (five mono-colour, ten two-colour), shuffles it, and draws an opening hand of 7. Set both Score panels to 20 - that is your life total. Each player has a Battlefield, a Graveyard and an Exile pile; the Stack is shared.',
    turns:
      'On your turn: untap everything (the Battlefield\'s "Untap all" button does this in one click), draw a card, then play one land and as many spells as you can pay for. Tap a land or creature by rotating it. Spells wait on the shared Stack until both players are done responding, then resolve top-down. Creatures attack, the defender blocks, and unblocked damage comes off life. Recard tracks the table, not the rules - you and your opponent enforce costs, timing and combat between you.',
  },
  War: {
    goal: 'Win all the cards.',
    setup: 'Split the deck evenly between two players, face-down, no one looks at their cards.',
    turns:
      'Both players flip their top card at the same time; higher rank wins both cards. Tied cards trigger a "war": each player plays 3 cards face-down and 1 face-up, and the higher face-up card wins the whole pile.',
  },
  'Gin Rummy': {
    goal: 'Group your hand into sets (same rank) and runs (consecutive same-suit) with the least leftover ("deadwood") points.',
    setup: 'Deal 10 cards to each of 2 players. Remaining deck is the draw pile; the Discard pile starts empty - discard your first unwanted card there to start it.',
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
  // Sprint pileObjects (US-105). This entry exists because the preset
  // test enforces that every preset is LINKED to a rules entry rather
  // than shipped disconnected (an earlier Smith gate) - and the honest
  // rules for this one are "there are no rules", which is worth saying
  // plainly rather than inventing a poker variant the app cannot play.
  'Chips & Tokens': {
    goal: 'None - this is a table with chips and tokens on it, not a game.',
    setup:
      'A supply of coloured chips and a supply of marked tokens start on the table, alongside a normal deck and 5 cards each. Drag chips and tokens anywhere you would drag a card.',
    turns:
      'Whatever your group agrees. Chips carry no value and tokens count nothing - they are physical objects to push around, the same way a real table has chips on it before anyone decides what they are worth.',
  },
  Solitaire: {
    goal: 'Build all 52 cards up onto the 4 foundations, one per suit, Ace to King.',
    setup:
      'Deal 7 tableau piles (1 to 7 cards each, only the top card face-up); the rest of the deck is the stock. This app builds the empty table (4 foundations + 7 cascades) automatically - deal the cards into place yourself by drawing from the deck.',
    turns:
      'Move a face-up card onto a foundation (same suit, next rank up) or onto another tableau card (opposite color, next rank down). Draw from the stock when you\'re stuck.',
  },
  Spit: {
    goal: 'Be the first to empty your own stock pile.',
    setup:
      'Each player gets a private stock and a small face-up pile in front of them; two shared center piles start the round. This app builds the shared center piles and a personal pile per player automatically.',
    turns:
      'No turns - everyone plays at once. Play a card onto either center pile if it\'s one rank above or below (in either direction, wrapping King to Ace) the top card there.',
  },
};
