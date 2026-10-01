// US-129/D154-shaped, but War has no strategy to pick: one mechanical
// bot. Observes through a peer (a harness peer in a real browser, or a
// fake table in tests), works out what it owes from the table alone
// (there is nothing to decide), acts through the same reducer actions a
// person's drag-and-drop produces, and returns one typed record per
// move. See `games/war/turn.yaml` for the flow this drives.
//
// Ace-high (`WAR_RANKS`) - `src/decks/standardDeck.js`'s own `RANKS` puts
// Ace first for sorting, which is the wrong order for comparing War hands.
//
// Bookkeeping War needs that the table itself does not provide: the
// Table pile holds BOTH players' flipped cards with no owner field (it is
// a plain pile, not a hand), so nothing on the wire says which one is
// mine. This bot remembers the ids it moved there itself (`#myCardIds`)
// and treats every other card on the table as the opponent's - the same
// kind of client-side memory `tools/gin/observe.mjs`'s `GinTracker` keeps
// for Gin, just keyed by id instead of by diff.
//
// Disclosed simplification (not a bug, scoped out): the official rule is
// that a player who cannot complete the war (fewer than 4 cards left)
// loses outright. This bot instead plays as many of the 3 face-down + 1
// face-up as remain, which can end a war with fewer than 4 a side - good
// enough to finish a run, not a faithful implementation of that edge rule.

const WAR_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const rankValue = (card) => WAR_RANKS.indexOf(card.rank);
const TABLE_PILE_ID = 'table';
// Real bug found live (US-129): `peer.act()` resolves once the action is
// SENT, not once the host's broadcast round-trip lands back in this
// bot's own view - a guest-to-host gap `tools/gin/bot.mjs`'s own
// `#execute` already confirms with `waitForView` after every action.
// This bot fired MOVE then immediately FLIP (and, during a collect,
// pairs of these back to back) with no such confirmation - fine against
// the synchronous `FakeWarTable`, but against a real table two bots
// racing ahead of their own unconfirmed actions diverged on whose round
// it was and froze (a live 2-bot run stopped making any move at all,
// mid-war, confirmed by direct inspection: no desync in the data, both
// sides' own counters had just stopped agreeing with the table).
const ACT_TIMEOUT_MS = 15_000;

/**
 * The predicate `#actAndConfirm` hands to `peer.waitForView` - see that
 * method's own doc comment for why this has to stay a pure function of
 * exactly `(view, where)`, nothing closed over.
 */
function cardConfirmed(view, { pileId, cardId, faceUp }) {
  const card = view.piles.find((pile) => pile.id === pileId)?.cards.find((each) => each.id === cardId);
  return faceUp === undefined ? card !== undefined : card?.faceUp === faceUp;
}

/**
 * @typedef {{
 *   iteration: number, at: string, phase: 'flip'|'collect', isWarContinuation: boolean,
 *   cards: string[], winner: 'me'|'opponent'|null, actions: object[],
 * }} WarIteration
 */

export class WarBot {
  #peer;
  #myId;
  #myCardIds = new Set();
  #iteration = 0;

  /**
   * @param {{ peer: object }} options
   */
  constructor({ peer }) {
    this.#peer = peer;
  }

  async #observe() {
    this.#myId ??= await this.#peer.myId();
    const view = await this.#peer.view();
    const myDeck = view.piles.find((pile) => pile.kind === 'deck' && pile.ownerId === this.#myId);
    const opponentDeck = view.piles.find((pile) => pile.kind === 'deck' && pile.ownerId && pile.ownerId !== this.#myId);
    const table = view.piles.find((pile) => pile.id === TABLE_PILE_ID);
    const tableCards = table?.cards ?? [];
    const mineFaceUp = tableCards.filter((card) => this.#myCardIds.has(card.id) && card.faceUp);
    const theirsFaceUp = tableCards.filter((card) => !this.#myCardIds.has(card.id) && card.faceUp);
    return { view, myDeck, opponentDeck, tableCards, mineFaceUp, theirsFaceUp };
  }

  /**
   * US-129/D154: what the table says right now - phase (flip | collect |
   * wait | done) and, for `flip`, whether the war procedure's extra 3
   * face-down cards are owed (the last comparison tied). War's turn file
   * reads its move from this; nothing here acts.
   */
  async look() {
    const obs = await this.#observe();
    const { myDeck, opponentDeck, mineFaceUp, theirsFaceUp } = obs;
    // Real bug found live (zero-record run, US-129): before the host's
    // DEAL step runs, there is no `deck`-kind pile to find at all yet
    // (War converts each dealt pile to `deck` kind only AFTER dealing,
    // `src/presets.js`'s `playerPileKind`) - a bot seated ahead of that
    // step saw `myDeck === undefined`, read it as "0 cards LEFT" via the
    // `?? 0` fallback, and declared the run `done` before ever flipping.
    // "not dealt yet" and "dealt, then exhausted" both look like 0 cards
    // unless the two are told apart here, at the one place that knows
    // which pile is missing outright versus merely empty.
    if (!myDeck || !opponentDeck) return { phase: 'wait', obs };
    const myCount = mineFaceUp.length;
    const theirCount = theirsFaceUp.length;
    const myCardsLeft = myDeck.cards.length;
    if (myCount < theirCount) {
      // Catching up. If I have nothing left to catch up WITH, the run
      // ends here rather than waiting forever for cards I don't have.
      if (myCardsLeft === 0) return { phase: 'done', obs };
      // Whether this round is a war continuation is read off the round
      // before it (the one both sides already share), the same tie
      // test used below.
      const isWarContinuation = myCount > 0 && rankValue(mineFaceUp.at(-1)) === rankValue(theirsFaceUp.at(myCount - 1));
      return { phase: 'flip', isWarContinuation, obs };
    }
    if (myCount > theirCount) return { phase: 'wait', obs }; // ahead; waiting on the opponent's flip
    if (myCount === 0) {
      // No pending round. Only check at a boundary like this one - a
      // deck legitimately hits 0 mid-round (the last card either side
      // has), and the pot still owes its collect before anything ends.
      if (myCardsLeft === 0 || opponentDeck.cards.length === 0) return { phase: 'done', obs };
      return { phase: 'flip', isWarContinuation: false, obs };
    }
    const mine = rankValue(mineFaceUp.at(-1));
    const theirs = rankValue(theirsFaceUp.at(-1));
    if (mine === theirs) {
      if (myCardsLeft === 0) return { phase: 'done', obs }; // tied, nothing left to continue the war with
      return { phase: 'flip', isWarContinuation: true, obs };
    }
    return mine > theirs ? { phase: 'collect', obs } : { phase: 'wait', obs }; // only the winner collects
  }

  /**
   * Dispatches `action`, then waits for THIS bot's own view to actually
   * reflect it before returning - see the module header. The predicate
   * (`cardConfirmed`, module-level) has to be a PURE function of exactly
   * `(view, argument)` with no outer closure at all: against the real
   * harness peer, `waitForView` is Playwright's `page.waitForFunction`,
   * which re-serializes the predicate into the BROWSER's own JS realm -
   * it cannot see this instance's `this`, let alone a private field.
   * First draft closed over `this.#onTable(...)` directly and threw
   * `Private field '#onTable' must be declared in an enclosing class`
   * live, the moment two real bots actually exercised it.
   * @param {{ pileId: string, cardId: string, faceUp?: boolean }} where
   *   `faceUp` omitted just confirms the card arrived; given, confirms
   *   that value too (`true` after a reveal, `false` after a collect).
   */
  async #actAndConfirm(action, where) {
    await this.#peer.act(action);
    await this.#peer.waitForView(cardConfirmed, where, { timeout: ACT_TIMEOUT_MS });
    return action;
  }

  /**
   * Moves `count` cards off the top of `myDeck`, face-down, except the
   * LAST one, which is flipped face-up for comparison - exactly the War
   * procedure (1 for an ordinary round, 4 for a continuation), capped by
   * whatever is actually left in the deck.
   */
  async #flip(myDeck, count) {
    const actions = [];
    const take = Math.min(count, myDeck.cards.length);
    const chosen = myDeck.cards.slice(-take); // the top of the deck is the end of the array (D21's own convention)
    for (const [index, card] of chosen.entries()) {
      const move = { type: 'MOVE', pileableId: card.id, toPileId: TABLE_PILE_ID };
      actions.push(await this.#actAndConfirm(move, { pileId: TABLE_PILE_ID, cardId: card.id }));
      this.#myCardIds.add(card.id);
      if (index === chosen.length - 1) {
        const flip = { type: 'FLIP', pileableId: card.id };
        actions.push(await this.#actAndConfirm(flip, { pileId: TABLE_PILE_ID, cardId: card.id, faceUp: true }));
      }
    }
    return actions;
  }

  /**
   * At most one move: look, then act on exactly what `look()` found.
   * @returns {Promise<WarIteration>}
   */
  async step() {
    const { phase, isWarContinuation, obs } = await this.look();
    this.#iteration += 1;
    const record = { iteration: this.#iteration, at: new Date().toISOString(), phase, isWarContinuation: isWarContinuation ?? false, cards: [], winner: null, actions: [] };
    if (phase === 'flip') {
      record.actions = await this.#flip(obs.myDeck, isWarContinuation ? 4 : 1);
      record.cards = record.actions.filter((action) => action.type === 'MOVE').map((action) => action.pileableId);
      await this.#peer.say(isWarContinuation ? 'War!' : 'Flip.', { kind: 'war-move', phase, cards: record.cards });
      return record;
    }
    if (phase === 'collect') {
      const actions = [];
      for (const card of obs.tableCards) {
        const move = { type: 'MOVE', pileableId: card.id, toPileId: obs.myDeck.id };
        actions.push(await this.#actAndConfirm(move, { pileId: obs.myDeck.id, cardId: card.id }));
        // Only a FACE-UP card needs flipping back down - the war
        // procedure's 3 face-down cards never left that state, and FLIP
        // is a toggle (D154's own doc comment on the reducer), so
        // flipping one of those unconditionally would un-hide it.
        if (card.faceUp) {
          const flip = { type: 'FLIP', pileableId: card.id };
          actions.push(await this.#actAndConfirm(flip, { pileId: obs.myDeck.id, cardId: card.id, faceUp: false }));
        }
      }
      record.actions = actions;
      record.cards = obs.tableCards.map((card) => card.id);
      record.winner = 'me';
      await this.#peer.say(`Won the pile (${obs.tableCards.length} cards).`, { kind: 'war-move', phase, cards: record.cards });
      return record;
    }
    return record; // wait | done: nothing to do
  }
}
