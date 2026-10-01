import { pileInstanceFor } from './piles/pileTypes.js';
import { ZONE_TYPES } from './zones/zoneTypes.js';
import { Zone } from './zones/Zone.js';

const DECK_ACTION_IDS = new Set(['draw', 'deal', 'reshuffleDeal', 'reset', 'shuffle']);

/**
 * Transient, beside the deck - where the click that caused it happened.
 * The `'deckError'` dispatch strategy (below) reports through this - a
 * plain module function here, not injected from `main.js`, since it
 * touches only its own DOM element and nothing session-specific.
 */
function showDeckError(message) {
  const element = document.querySelector('#deck-error');
  element.textContent = message;
  element.hidden = false;
  clearTimeout(showDeckError.timer);
  showDeckError.timer = setTimeout(() => { element.hidden = true; }, 4000);
}

/**
 * Every player-triggered game action - what a pile/stack/zone/card's
 * own controls dispatch, one call each. `main.js` still owns the actual
 * session state (`gameState`, `role`, `myId`...) and the render loop
 * (`buildZoneOptions`/`renderGameFromView`) that wires these in as
 * callbacks; this module's own job is narrower still: resolve WHICH
 * pile or zone is acting, ask ITS OWN class (`src/piles/Pile.js`,
 * `src/zones/Zone.js`) what that action MEANS, then be the one place
 * that actually dispatches it.
 *
 * The pile/zone classes are pure: `performAction`/`rename`/etc. return
 * a small descriptor - `{ action, guard }` - instead of calling
 * anything. `dispatch()` (below) is the only interpreter of `guard`,
 * which is why it is the only place in this whole cluster that ever
 * calls `submitAction`/`dispatchAction`/`dispatchOrAlert`/`showDeckError`.
 * A new pile/zone kind is one new file; a new action that reuses an
 * existing guard is one line in whichever class offers it; even a
 * brand-new DISPATCH STRATEGY is one new guard name plus one `if` here
 * - never a new capability threaded through every pile/zone file's own
 * signature, which is what letting them call dispatch themselves would
 * have cost as the vocabulary of actions grows.
 *
 * `splitPicker` (real UI-local state - which pile is currently raised
 * into its Split picker) lives here, not as a module-level `let` in
 * `main.js`. `lastDealCount` stays a `main.js` `let` instead: host-setup
 * seeds it too (a restored/started table's own deal size), so it is
 * genuinely shared, not this cluster's alone.
 *
 * @param {object} io
 * @param {() => object|null} io.currentView
 * @param {(action: object) => void} io.submitAction raw dispatch - a
 *   host-side reducer throw propagates; `dispatch()` catches it for the
 *   `'deckError'`/split-commit paths and nowhere else (faithful port,
 *   not a redesign)
 * @param {(action: object) => void} io.dispatchAction submitAction,
 *   guarded by `isSessionEnded` - the `'silent'` strategy
 * @param {(action: object) => void} io.dispatchOrAlert the same guard,
 *   plus a caught reducer throw shown as `alert(error.message)` - the
 *   `'alert'` strategy
 * @param {() => boolean} io.isSessionEnded
 * @param {() => string} io.getMyId
 * @param {() => number} io.getLastDealCount
 * @param {() => void} io.rerender forces a re-render off the current
 *   view for a purely local change (the split picker) with no
 *   server round trip to wait for
 */
export function createTableActions(io) {
  const { currentView, dispatchAction, isSessionEnded, getMyId, getLastDealCount, rerender } = io;

  // D91/D92: which pile (if any) is currently raised into the Split
  // picker - real CLIENT-LOCAL UI state, same reasoning as
  // `lastDealCount`: this app tears down and rebuilds every pile's DOM
  // on every broadcast, so a "stay raised until toggled off or
  // committed" mode has nowhere else to live. Never sent to the
  // reducer - only the eventual `SPLIT_PILE` dispatch (`performSplitCommit`)
  // is a real state change.
  let splitPicker = null; // { pileId: string } | null

  function pileFor(pileId) {
    const record = currentView()?.piles.find((p) => p.id === pileId);
    return record && pileInstanceFor(record, getMyId());
  }

  function zoneFor(zoneId) {
    const record = currentView()?.zones.find((z) => z.id === zoneId);
    return record ? (ZONE_TYPES[record.type] ?? Zone) : Zone;
  }

  /**
   * The one interpreter of a pile/zone method's own `{ action, guard }`
   * descriptor - every dispatch strategy this cluster knows, named
   * once. `undefined` (nothing to do - an unrecognized action, or a
   * recognized one this pile/zone has no target for) is a silent no-op.
   */
  function dispatch(descriptor) {
    if (!descriptor) return;
    const { action, guard } = descriptor;
    if (guard === 'silent') { dispatchAction(action); return; }
    if (guard === 'alert') { io.dispatchOrAlert(action); return; }
    if (guard === 'deckError') {
      if (isSessionEnded()) return;
      try { io.submitAction(action); }
      catch (error) { showDeckError(error.message); }
    }
  }

  function revealCard(pileableId) {
    dispatchAction({ type: 'FLIP', pileableId });
  }

  function rotateCard(pileableId) {
    dispatchAction({ type: 'ROTATE', pileableId });
  }

  function pickupCard(pileableId) {
    dispatchAction({ type: 'PICKUP', pileableId });
  }

  function moveCard(pileableId, toPileId, placement = {}) {
    const { targetCardId, side, layout } = placement;
    dispatchAction({ type: 'MOVE', pileableId, toPileId, targetCardId, side, layout });
  }

  // US-28/US-32/US-33: the drop target doesn't know or care where a
  // dragged card came from, only where it landed and what `placement`
  // (the drop-region hit test) says about how. D102: a hand-sourced
  // drag is an ordinary MOVE now (`transferCard`, state.js, applies the
  // leaving-a-hand transform from the transition itself).
  function dropCardOnPile(pileableId, targetPileId, placement = {}) {
    if (isSessionEnded()) return;
    const view = currentView();
    if (!view) return;
    // UX follow-up: the hand pile is a real, addressable pile - a table
    // card dropped onto it needs PICKUP's own semantics (strips owner/
    // faceUp/layout), not a generic MOVE.
    const targetPile = view.piles.find((p) => p.id === targetPileId);
    if (targetPile?.kind === 'hand' && targetPile.ownerId === getMyId()) {
      pickupCard(pileableId);
      return;
    }
    moveCard(pileableId, targetPileId, placement);
  }

  function performSplitCommit(index) {
    if (!splitPicker || isSessionEnded()) return;
    const { pileId } = splitPicker;
    splitPicker = null;
    try { io.submitAction({ type: 'SPLIT_PILE', pileId, index }); }
    catch (error) { globalThis.alert(error.message); rerender(); }
  }

  /**
   * Every pile-level action button dispatches through here (`<pile-panel>`,
   * one callback regardless of which pile kind offered the action). D92:
   * no `pile.kind === 'deck'` gate - `pileFor(pileId)` resolves the real
   * class, which is what decides what each action means.
   */
  function handlePileAction(pileId, actionId, value) {
    // `split` opens the Split picker - real client-local UI state, not
    // a dispatch, so it never reaches a pile instance at all.
    if (actionId === 'split') return toggleSplitPicker(pileId);
    // D92: `DECK_ACTION_IDS` membership already uniquely identifies the
    // four deck-only ids (`DeckPile.pileActions()` is what decides which
    // pile kind's header offers them); `getLastDealCount()` supplies the
    // one value `deal`/`reshuffleDeal` need that `handlePileAction`'s own
    // caller never has (what's currently typed into the deal-count box).
    const resolvedValue = DECK_ACTION_IDS.has(actionId) ? getLastDealCount() : value;
    dispatch(pileFor(pileId)?.performAction(actionId, { pileId, value: resolvedValue }));
  }

  /**
   * D129 (direct user request): a stack's own gear emblem. Every action
   * it offers acts on ONE stack, addressed by its key.
   */
  function handleStackAction(pileId, stackKey, actionId, value) {
    dispatch(pileFor(pileId)?.performStackAction(stackKey, actionId, value));
  }

  function performRenamePile(pileId, name) {
    dispatch(pileFor(pileId)?.rename(pileId, name));
  }

  function performRenameZone(zoneId, name) {
    dispatch(zoneFor(zoneId).rename(zoneId, name));
  }

  function performRemoveZone(zoneId) {
    dispatch(zoneFor(zoneId).remove(zoneId));
  }

  function performMovePile(pileId, targetZoneId) {
    // `targetZoneId: null` ungroups into a fresh standalone Zone (D55) -
    // no real target zone to resolve a class from; the base class's
    // shape covers it either way (no zone kind differs on this).
    dispatch((targetZoneId ? zoneFor(targetZoneId) : Zone).acceptDroppedPile(pileId, targetZoneId));
  }

  // "All piles can be dropped into any other pile... cards added to the
  // target, dropped pile removed once empty." Pile-to-pile, not a zone
  // concern - stays a plain dispatch here.
  function performMergePile(pileId, targetPileId) {
    io.dispatchOrAlert({ type: 'MERGE_PILE', pileId, targetPileId });
  }

  function performCreatePileWithCard(pileableId, zoneId) {
    if (isSessionEnded()) return;
    dispatch(zoneFor(zoneId).acceptDroppedCard(pileableId, zoneId, currentView()));
  }

  // US-149/D171: the Builder menu's "Add Zone"/"Add Pile" - CREATE_ZONE/
  // CREATE_PILE already exist as real, tested reducer actions (found
  // live with no UI entry point anywhere). Plain `dispatchOrAlert`
  // calls, not routed through a Pile/Zone instance's own
  // `{action,guard}` descriptor (D165) - there is no existing instance
  // to ask, same category as `adjustScore`/`setScore` in `main.js`.
  function performCreateZone(kind) {
    io.dispatchOrAlert({ type: 'CREATE_ZONE', kind });
  }

  function performCreatePile(kind, zoneId) {
    io.dispatchOrAlert({ type: 'CREATE_PILE', kind, zoneId });
  }

  /**
   * Opens (or, clicked again on the same pile, closes) the Split picker
   * for `pileId` - purely local, no dispatch. Switching to a DIFFERENT
   * pile's picker just replaces it outright.
   */
  function toggleSplitPicker(pileId) {
    splitPicker = splitPicker?.pileId === pileId ? null : { pileId };
    rerender();
  }

  return {
    handlePileAction,
    handleStackAction,
    revealCard,
    rotateCard,
    pickupCard,
    moveCard,
    dropCardOnPile,
    performSplitCommit,
    performRenamePile,
    performRenameZone,
    performRemoveZone,
    performMovePile,
    performMergePile,
    performCreatePileWithCard,
    performCreateZone,
    performCreatePile,
    toggleSplitPicker,
    /** The pile currently raised into its Split picker, or `null` -
     * read fresh by `buildZoneOptions` on every render. */
    get splitPicker() { return splitPicker; },
  };
}
