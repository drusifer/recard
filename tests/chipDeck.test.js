import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDeck } from '../src/deck.js';
import { createInitialState, pilesOf, reduce } from '../src/state.js';
import { PRESETS } from '../src/presets.js';
import { ChipPile } from '../src/piles/ChipPile.js';
import { TokenPile } from '../src/piles/TokenPile.js';
import { PILE_TYPES } from '../src/piles/pileTypes.js';

/**
 * Sprint pileObjects, Phase 102 (US-105). A chip supply is a DECK_TYPE,
 * not a new preset schema and not a reducer change - D107's claim was
 * that a declared pile already pre-stocks through `buildDeck` (D81), so
 * this phase should touch `state.js` not at all. These tests are what
 * make that claim checkable rather than asserted.
 */

test('buildDeck: the chips deck type builds chips, not cards', () => {
  const supply = buildDeck({ type: 'chips', deckList: 'standard-chips' });
  assert.ok(supply.length > 0);
  assert.ok(supply.every((chip) => chip.pileableType === 'chip'), 'every one is a chip');
  assert.ok(supply.every((chip) => chip.id), 'every one has a unique-ish id');
  assert.equal(new Set(supply.map((chip) => chip.id)).size, supply.length, 'ids are unique');
});

// Smith Gate 1 condition A, at the supply level: a supply of identical
// discs is the failure this condition exists to prevent, so the built
// supply must actually span colours.
// The bug the conservation guard caught the moment a second player
// joined a poker table: two builds of the same list handed both players
// the same `chip-white-0`.
test('buildDeck: two builds of the same chip list share no ids', () => {
  const first = buildDeck({ type: 'chips', deckList: 'poker-stack' }).map((chip) => chip.id);
  const second = buildDeck({ type: 'chips', deckList: 'poker-stack' }).map((chip) => chip.id);
  assert.equal(new Set([...first, ...second]).size, first.length + second.length,
    'every id across both builds is distinct');
});

test('buildDeck: a chip supply spans more than one colour', () => {
  const colours = new Set(buildDeck({ type: 'chips', deckList: 'standard-chips' }).map((chip) => chip.colour));
  assert.ok(colours.size > 1, `a supply of one colour is the thing Gate 1 rejected: ${[...colours]}`);
});

// UPDATED by the gem *nit (direct user request: "tokens should look
// like gems. they don't need denominations") - a token no longer
// carries a label at all, only a colour, same as a chip did before
// "make change" needed a visible value.
test('buildDeck: the token list builds tokens with a colour and no label', () => {
  const tokens = buildDeck({ type: 'chips', deckList: 'standard-tokens' });
  assert.ok(tokens.every((token) => token.pileableType === 'token'));
  assert.ok(tokens.every((token) => typeof token.colour === 'string'), 'every token is tellable apart by colour');
  assert.ok(tokens.every((token) => token.label === undefined), 'a token carries no label any more');
});

test('buildDeck: a token supply spans more than one colour', () => {
  const colours = new Set(buildDeck({ type: 'chips', deckList: 'standard-tokens' }).map((token) => token.colour));
  assert.ok(colours.size > 1, `a supply of one colour reads as broken: ${[...colours]}`);
});

test('buildDeck: rejects an unknown chip list by name, rather than building an empty supply', () => {
  assert.throws(() => buildDeck({ type: 'chips', deckList: 'no-such-list' }), /no-such-list/);
});

// The demonstration: the sprint's ONLY user-visible output.
test('the chips preset puts a real, stocked chip pile on the table with no manual setup', () => {
  // Named, not "the first preset with chips": poker declares chips too
  // now, and its stacks are `perPlayer`, so they only exist once someone
  // has joined. This test is about the shared demo supply specifically.
  const preset = PRESETS.find((p) => p.name === 'Chips & Tokens');
  assert.ok(preset, 'the demo preset declares a chip supply');

  // `piles` is read from the THIRD argument (gameConfig), the same way
  // `main.js` assembles it from the chosen preset - not from the deck
  // config in the first.
  const state = createInitialState({}, () => 0.5, { piles: preset.piles, zones: preset.zones });
  const stocked = pilesOf(state).filter((pile) => pile.cards.some((item) => item.pileableType === 'chip'));
  assert.ok(stocked.length > 0, 'the chips are on the table at state creation, before anyone acts');
  assert.ok(stocked[0].cards.length > 1);
});

test('every other preset is untouched - none of them gains a chip', () => {
  for (const [name, preset] of Object.entries(PRESETS)) {
    if (preset.piles?.some((pile) => pile.deckType === 'chips')) continue;
    const state = createInitialState({}, () => 0.5, { piles: preset.piles, zones: preset.zones });
    const chips = pilesOf(state).flatMap((pile) => pile.cards).filter((item) => item.pileableType === 'chip');
    assert.equal(chips.length, 0, `${name} must not gain chips`);
  }
});


// --- Smith's *user test findings, T102.2 -----------------------------

// BUG 2: both supply piles fell back to the default name "Pile", so
// nothing on screen said which held chips and which held tokens.
// Widened from the demo preset to EVERY preset that declares a supply,
// once poker and RtG got one: this used to find "the first preset with
// chips", which quietly became poker and stopped testing what its name
// says. An invariant is the honest form of it anyway.
test('every chip or token supply, in every preset, is NAMED rather than left as the default "Pile"', () => {
  for (const preset of PRESETS) {
    const supplies = preset.piles?.filter((pile) => pile.deckType === 'chips') ?? [];
    if (supplies.length === 0) continue;
    const names = supplies.map((pile) => pile.name);
    assert.ok(names.every(Boolean), `${preset.name}: every supply declares a name, got ${JSON.stringify(names)}`);
    assert.equal(new Set(names).size, names.length, `${preset.name}: supply names differ from each other`);
  }
});

// BUG 1: 40 chips rendered flat across three wrapped rows. A declared
// pile can carry a starting spread now, so a supply stacks the way a
// real one does - reusing D106's primitive rather than adding another.
test('a declared pile may carry a starting spread, and it reaches the built pile', () => {
  const state = createInitialState({}, () => 0.5, {
    piles: [{ kind: 'plain', ownerId: null, count: 1, id: 'stacked', spread: 0.8 }],
  });
  assert.equal(pilesOf(state).find((pile) => pile.id === 'stacked').spread, 0.8);
});

test('a declared pile with no spread is untouched - undefined, so its type default applies', () => {
  const state = createInitialState({}, () => 0.5, {
    piles: [{ kind: 'plain', ownerId: null, count: 1, id: 'plain-one' }],
  });
  assert.equal(pilesOf(state).find((pile) => pile.id === 'plain-one').spread, undefined);
});

// UPDATED by US-112 ("token piles have a lot of the same issues as the
// CardPiles did... push some of that up"): a token supply no longer
// declares its own spread override either - it has its own `TokenPile`
// kind now (`GroupedPile`, shared with `ChipPile`), whose
// `defaultSpread` stacks it the same way a chip tray's does. Neither
// chip nor token supplies repeat this per-preset any more; it's a
// property of the KIND.
test('every supply stacks - by the KIND\'s own defaultSpread, never a per-preset override', () => {
  for (const preset of PRESETS) {
    const supplies = preset.piles?.filter((pile) => pile.deckType === 'chips') ?? [];
    for (const pile of supplies) {
      assert.equal(pile.spread, undefined, `${preset.name}/${pile.name} should not need its own spread override any more`);
      const spread = PILE_TYPES[pile.kind]?.defaultSpread;
      assert.ok(spread > 0.5, `${preset.name}/${pile.name} should stack (kind ${pile.kind}, defaultSpread ${spread})`);
    }
  }
});

test('ChipPile and TokenPile share the exact same stacking spread, via GroupedPile', () => {
  assert.equal(ChipPile.defaultSpread, TokenPile.defaultSpread);
  assert.equal(ChipPile.maxSpread, TokenPile.maxSpread);
});


// --- Chips in poker, tokens in RtG (direct user request) -------------
//
// "chips in the poker and tokens in rtg". The supplies stop being a demo
// and reach the presets that actually want them: poker is played with
// chips, and MTG's whole token/counter vocabulary is what `standard-tokens`
// was modelled on.

const presetNamed = (name) => PRESETS.find((preset) => preset.name === name);

test('both poker presets give every player their OWN chip stack', () => {
  for (const name of ['Poker — 5 Card Draw', "Texas Hold'em"]) {
    const preset = presetNamed(name);
    assert.ok(preset, `${name} exists`);
    const chips = preset.piles?.filter((pile) => pile.deckType === 'chips') ?? [];
    assert.equal(chips.length, 1, `${name} declares one chip supply`);
    // Per player, not one shared bank: in real poker every player has
    // their own stack, and a single shared pile would make "whose chips
    // are these" unanswerable the moment two people take from it.
    assert.equal(chips[0].ownerId, 'perPlayer', `${name} chips are per-player`);
    assert.ok(chips[0].name, 'and the pile is named');
  }
});

test('a poker chip stack is a playable size, not the full 40-chip supply', () => {
  const stack = presetNamed("Texas Hold'em").piles.find((pile) => pile.deckType === 'chips');
  const built = buildDeck({ type: 'chips', deckList: stack.deckList });
  assert.ok(built.length > 0 && built.length <= 20,
    `a per-player stack should be modest, got ${built.length} chips each`);
  assert.ok(new Set(built.map((chip) => chip.colour)).size > 1, 'and still span colours');
});

test('Recard the Gathering gets a shared token supply', () => {
  const preset = presetNamed('Recard the Gathering');
  const tokens = preset.piles.filter((pile) => pile.deckType === 'chips' && pile.deckList.includes('token'));
  assert.equal(tokens.length, 1);
  // Shared, unlike poker's chips: an MTG token is created onto the
  // battlefield by whoever needs one, not owned in advance.
  assert.equal(tokens[0].ownerId, null);
  assert.ok(tokens[0].name);
});

// Smith's Gate-1 condition C3 on the RtG sprint: that table is already
// the most crowded one this app builds. A new panel there must be
// placed, not left to land wherever.
test('the RtG token supply has an explicit layout entry, on the most crowded table we build', () => {
  const preset = presetNamed('Recard the Gathering');
  const tokens = preset.piles.find((pile) => pile.deckList?.includes('token'));
  const id = tokens.id ?? tokens.name;
  assert.ok(preset.layout[id] ?? preset.layout[tokens.id],
    `token supply needs a layout entry, layout has ${Object.keys(preset.layout)}`);
});

test('presets that use neither still declare no chips at all', () => {
  for (const name of ['War', 'Hearts', 'Gin Rummy', 'Pinochle', 'Solitaire', 'Spit']) {
    const preset = presetNamed(name);
    assert.ok(!preset.piles?.some((pile) => pile.deckType === 'chips'), `${name} gains nothing`);
  }
});


// --- perPlayer declarations were never stocked (found live) ----------
//
// D81 gave a DECLARED pile the ability to start pre-stocked, but only on
// the shared path (`buildPiles`). The `perPlayer` path runs at JOIN,
// where a declaration was destructured down to `{kind, count}` - so
// `deckList`, `name` and `spread` were silently dropped. Nothing noticed
// until poker asked for a per-player chip stack and got empty piles
// called "Alice's Pile". Found by driving the real app, not by a test.

function joinAll(state, names) {
  let next = state;
  for (const [index, name] of names.entries()) {
    next = reduce(next, { type: 'JOIN', playerId: `p${index}`, name, rng: () => 0.5 });
  }
  return next;
}

test('a perPlayer declaration is pre-stocked, exactly like a shared one', () => {
  let state = createInitialState({}, () => 0.5, {
    piles: [{ kind: 'plain', ownerId: 'perPlayer', count: 1, name: 'Chips', deckType: 'chips', deckList: 'poker-stack' }],
  });
  state = joinAll(state, ['Alice', 'Bob']);

  const stacks = pilesOf(state).filter((pile) => pile.cards.some((item) => item.pileableType === 'chip'));
  assert.equal(stacks.length, 2, 'one stocked stack per player');
  assert.ok(stacks.every((pile) => pile.cards.length > 1));
  assert.notEqual(stacks[0].ownerId, stacks[1].ownerId, 'and they belong to different players');
});

test('a perPlayer declaration\'s name reaches the pile, inside the possessive', () => {
  let state = createInitialState({}, () => 0.5, {
    piles: [{ kind: 'plain', ownerId: 'perPlayer', count: 1, name: 'Chips', deckType: 'chips', deckList: 'poker-stack' }],
  });
  state = joinAll(state, ['Alice']);
  const pile = pilesOf(state).find((p) => p.cards.some((item) => item.pileableType === 'chip'));
  assert.equal(pile.name, "Alice's Chips", `got "${pile.name}"`);
});

test('a perPlayer declaration\'s spread reaches the pile too', () => {
  let state = createInitialState({}, () => 0.5, {
    piles: [{ kind: 'plain', ownerId: 'perPlayer', count: 1, spread: 0.82 }],
  });
  state = joinAll(state, ['Alice']);
  assert.equal(pilesOf(state).find((p) => p.ownerId === 'p0' && p.kind === 'plain').spread, 0.82);
});

test('a perPlayer declaration with none of those is unchanged - Spit\'s stock still starts empty and unnamed by declaration', () => {
  let state = createInitialState({}, () => 0.5, {
    piles: [{ kind: 'cascade', ownerId: 'perPlayer', count: 1 }],
  });
  state = joinAll(state, ['Alice']);
  const pile = pilesOf(state).find((p) => p.kind === 'cascade');
  assert.equal(pile.cards.length, 0);
  assert.equal(pile.spread, undefined);
  assert.match(pile.name, /Alice's/);
});
