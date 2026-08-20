import test from 'node:test';
import assert from 'node:assert/strict';
import { PILE_ACTIONS, pileLevelActions, actionsForPileKind } from '../src/pileActions.js';

test('the deck offers the host dealing actions', () => {
  assert.deepEqual(pileLevelActions('deck', { isHost: true }), ['deal', 'reshuffleDeal']);
});

test('a guest is offered nothing on the deck - dealing stays host-only', () => {
  assert.deepEqual(pileLevelActions('deck', { isHost: false }), []);
});

test('hands and zones have no pile-level actions', () => {
  // Deliberately narrow: this table exists for dealing, and inventing
  // pile-level actions for zones "while we are here" would put controls
  // on screen that no story asked for.
  for (const kind of ['hand', 'zone', 'nonsense']) {
    assert.deepEqual(pileLevelActions(kind, { isHost: true }), [], `${kind} must offer nothing`);
  }
});

test('pile-level actions are a SEPARATE list from card actions (D29)', () => {
  // The whole point of D29: `deal` acts on the pile, not on the card you
  // happen to be hovering. If it ever leaks into the card table it will
  // be rendered in the hover row, one row from Draw - an irreversible
  // action reached by passing a cursor over a card (Smith Gate 1 #2).
  assert.deepEqual(actionsForPileKind('deck'), ['draw'],
    'deal must NOT appear in the per-card action table');
});

test('every pile-level action declares a label and whether it destroys the round', () => {
  for (const id of ['deal', 'reshuffleDeal']) {
    const spec = PILE_ACTIONS[id];
    assert.ok(spec, `${id} must be declared`);
    assert.ok(spec.label?.length > 0, `${id} needs a label`);
    assert.equal(typeof spec.destructive, 'boolean', `${id} must say whether it is destructive`);
  }
});

test('reshuffleDeal is marked destructive and deal is not', () => {
  // This flag is what drives the confirm and the danger styling (Smith
  // Gate 2 #1). Getting it backwards would put a confirm on the harmless
  // action and none on the one that wipes every hand.
  assert.equal(PILE_ACTIONS.reshuffleDeal.destructive, true);
  assert.equal(PILE_ACTIONS.deal.destructive, false);
});
