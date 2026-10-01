import { ACTION_SPECS } from '../pileActions.js';
import { pileDragToken } from '../dragDrop.js';
import { buildSpecialActionControl } from '../actionControls.js';

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

    const visibleIds = actionIds.filter((id) => !options.disabled?.includes(id));
    if (visibleIds.length > 0) this.append(buildHeaderGear(visibleIds, options));
  }
}

/**
 * UX follow-up (direct user request: "move pile action buttons to a
 * corner gear icon menu like the slack settings"): a header used to be
 * its own row of buttons (plus any enum/range control inline) - now it's
 * one gear emblem, same idea as the stack's own `stackGearFor`/
 * `openStackActionMenu` (`pileCards.js`, D129) one level up. Reuses that
 * exact popup (`<action-menu>`, D101/D133) rather than inventing a
 * second one - a special control (the spread slider, change-pile-type's
 * enum disclosure) renders as a real `node` row, same as the stack menu
 * already does for `spreadStack`/`flipStack`; a plain action becomes a
 * row whose own `destructive`/`confirm` fields reuse `<action-menu>`'s
 * built-in confirm gate (`#rowFor`) instead of the inline
 * `globalThis.confirm` this file used to call directly - D67's own
 * "destructive gets ONE prompt, from the spec's own hint" rule is
 * unchanged, just moved into data instead of a click handler.
 */
function buildHeaderGear(actionIds, options) {
  const gear = document.createElement('button');
  gear.type = 'button';
  gear.className = 'pile-action-btn pile-gear';
  gear.textContent = '⚙';
  gear.title = 'Actions';
  gear.setAttribute('aria-label', 'Actions');
  gear.addEventListener('click', (event) => {
    event.stopPropagation();
    const items = actionIds.map((id) => {
      const spec = ACTION_SPECS[id];
      const control = buildSpecialActionControl(id, spec, options);
      if (control) return { node: control };
      const label = options.labels?.[id] ?? spec.label;
      return {
        id,
        text: `${spec.icon} ${label}`,
        title: spec.hint,
        label,
        // `options.noConfirm` (a 1-card `take`, Smith's ruling) skips the
        // dialog entirely, same as before - folded into whether this row
        // counts as "destructive" at all, since that's the one thing
        // `<action-menu>`'s own confirm gate checks.
        destructive: spec.destructive && !options.noConfirm?.includes(id),
        confirm: spec.hint,
      };
    });
    const at = gear.getBoundingClientRect();
    document.createElement('action-menu').open({
      x: at.left,
      y: at.bottom,
      items,
      className: 'pile-header-menu',
      onSelect: (id) => options.onAction(id),
    });
  });
  return gear;
}

customElements.define('header-actions', HeaderActionsElement);
