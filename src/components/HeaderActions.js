import { ACTION_SPECS } from '../pileActions.js';
import { pileDragToken } from '../dragDrop.js';
import { applyIconButton, buildSpecialActionControl } from '../actionControls.js';

/**
 * US-133/D160, cluster 4a: `<header-actions>` IS the actionable title bar.
 * It used to be a thin adapter over `renderActionHeader` in `ui.js`; that
 * body is now its `render`, and the controls it is made of (icon button,
 * enum dropdown, range slider) are `actionControls.js`, shared with the
 * stack's gear menu.
 *
 * "Like zones, Piles are Actionable and should have a title bar with action
 * buttons for that pile type" (the user's own framing): this is that one
 * title bar, built for BOTH the deck's own and every `<zone-panel>`'s
 * heading, instead of a bespoke heading-building function per call site.
 */
export class HeaderActionsElement extends HTMLElement {
  render(titleText, actionIds, options = {}) {
    this.replaceChildren();
    const extraClass = options.headingClass ? ` ${options.headingClass}` : '';
    this.className = `zone-name pile-action-header${extraClass}`;
    if (options.headingId) this.id = options.headingId;

    const label = document.createElement('span');
    label.className = 'zone-name-text';
    label.textContent = titleText;
    this.append(label);

    // *nit (2026-08-26): "allow user to rename zones and piles - any user
    // can edit". `titleText` often carries a derived suffix a pile's own
    // heading appends ("Hand (7)") that isn't part of the actual stored
    // name, so editing needs the RAW name (`options.rawName`) as its
    // starting value, not `titleText` itself - only wired when a caller
    // supplies `onRename` (a Zone with no name, e.g. the common
    // single-pile case, never gets this at all, matching how it already
    // renders no heading there).
    if (options.onRename) {
      label.title = 'Double-click to rename';
      label.classList.add('renamable');
      label.addEventListener('dblclick', (event) => {
        event.stopPropagation();
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'zone-name-edit';
        input.value = options.rawName ?? titleText;
        label.replaceWith(input);
        input.focus();
        input.select();

        let isSettled = false;
        const commit = () => {
          if (isSettled) return;
          isSettled = true;
          const name = input.value.trim();
          // A blank/unchanged edit reverts silently rather than round-
          // tripping a no-op (or a reducer throw the user never asked
          // for) through the network - same "cancel is a valid outcome"
          // spirit as the split/take confirm dialogs' Cancel button.
          if (name && name !== (options.rawName ?? titleText)) options.onRename(name);
          input.replaceWith(label);
        };
        input.addEventListener('blur', commit);
        input.addEventListener('keydown', (ke) => {
          if (ke.key === 'Enter') { ke.preventDefault(); input.blur(); }
          else if (ke.key === 'Escape') { isSettled = true; input.replaceWith(label); }
        });
        // A drag on the containing heading (Zone move, D24) shouldn't
        // start while the input has focus - the same class this heading
        // uses as a drag handle would otherwise steal the mousedown.
        input.addEventListener('mousedown', (me) => me.stopPropagation());
      });
    }

    // (bloop: piles/zones/cards are all Movable) - a reparentable pile's
    // own title bar IS its drag handle for moving it between zones (or
    // reordering within one), native HTML5 DnD (same mechanism a card's
    // own drag already uses). A Zone's OWN heading deliberately does NOT
    // get this - it uses real pointer-drag (`attachPanelDrag`,
    // `wirePanelLayout`) instead, for genuine free anywhere-on-the-table
    // positioning, which a discrete native-drop-target model can't give.
    // Two different Movable mechanisms for two different entities, not
    // one shared one - see `wirePanelLayout`'s own comment.
    if (options.pileDraggable) {
      this.draggable = true;
      this.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('text/plain', pileDragToken(options.pileId));
      });
    }

    for (const id of actionIds) {
      if (options.disabled?.includes(id)) continue;
      const spec = ACTION_SPECS[id];
      const specialControl = buildSpecialActionControl(id, spec, options);
      if (specialControl) {
        this.append(specialControl);
        continue;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pile-action-btn' + (spec.destructive ? ' btn-danger' : '');
      applyIconButton(button, spec, options.labels?.[id]);
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        // US-61 (Sprint 23), Smith's ruling (Phase 70): each spec's own
        // `hint` already states its real consequence (reshuffleDeal's own
        // hint says it deals a fresh hand to each player; take's says it
        // takes every card) - a second, hardcoded "every player's hand
        // will be cleared" sentence bolted on here was WRONG for every
        // destructive action except reshuffleDeal, silently inherited by
        // `take` the moment it became destructive (Phase 68). One prompt,
        // built from the actual action's own hint, for all of them.
        // `options.noConfirm` (a 1-card `take`, Smith's ruling) skips the
        // dialog entirely - identical in effect to that card's own
        // un-confirmed single-card `pickup`.
        if (spec.destructive && !options.noConfirm?.includes(id) &&
          !globalThis.confirm(`${spec.hint}\n\nContinue?`)) return;
        options.onAction(id);
      });
      // D67: the `spec.target`-driven action-token drag protocol (D34/
      // D35, fixed D65) is retired - direct user correction: "drop isn't
      // triggering an action it's moving cards around." An action that
      // always resolved to the SAME fixed destination (Draw -> your own
      // hand) regardless of where you actually released the drag was
      // never real drop semantics, just a click wearing a drag costume.
      // Draw stays available as a plain click (`onAction` above); the
      // deck's own real drag-to-anywhere entry point is now
      // `renderDeckStack`'s single card visual, using the exact same
      // generic card-move mechanism (`onDropCard`) every other pile's
      // cards already use - see its own comment for why a synthetic
      // token stands in for a real card id there.
      this.append(button);
    }
  }
}

customElements.define('header-actions', HeaderActionsElement);
