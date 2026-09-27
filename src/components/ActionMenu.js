import { clampMenuPosition } from '../menuPosition.js';

/**
 * Dispatched on `document` once a menu is actually in the DOM.
 *
 * *fix (standing backlog bug, filed 2026-09-13, root-caused 2026-09-17):
 * right-clicking a card/stack ALSO satisfies US-117 focus-zoom's own
 * hover-intent trigger (the click hovers first) - a menu opens and
 * closes well within the 180ms delay, but nothing ever cancelled the
 * timer THAT hover armed, so it fires later, unrelated to anything
 * still open, growing an orphaned pile mid a later interaction. main.js
 * owns the timer and has no reference to a menu (nor should it), so this
 * event is the seam: `wireFocusZoom` cancels the pending timer on it.
 */
export const PILE_MENU_OPENED_EVENT = 'pilemenu:opened';

/**
 * US-133: the popup both a card's right-click menu and a stack's gear
 * menu are, as one component. It owns what every such popup shares -
 * where it sits (anchored at the cursor, clamped on-screen), how it goes
 * away (Escape, or a click outside), that only one exists, and the
 * confirm gate on a destructive row. It does NOT know what a row means:
 * the caller hands over rows and gets `onSelect(id)` back (reveal,
 * rotate, "pick a destination" stay decisions of the code that opened it).
 *
 * Reuses `.pile-action-menu`/`.pile-action-menu-item` (`style.css`) - the
 * same list look the pile header's EnumAction menu has - plus
 * `.card-context-menu` for the fixed, cursor-anchored placement (D101:
 * "reuse the existing *Actions classes, not a parallel look").
 *
 * Created by tag name (`document.createElement('action-menu')`, like every
 * component - `ui.js` is also loaded by node tests, so it cannot import this
 * file) and appended to `document.body`, never to the card that asked, so no pile's
 * overflow can clip it.
 */
export class ActionMenuElement extends HTMLElement {
  /**
   * @param {object} settings
   * @param {number} settings.x cursor x, where the menu would naively open
   * @param {number} settings.y cursor y
   * @param {Array<{id?: string, text?: string, title?: string, label?: string,
   *   destructive?: boolean, confirm?: string, disabled?: boolean, node?: Node}>} settings.items
   *   a row, or a ready-made `node` (a slider) that keeps its own clicks
   * @param {(id: string) => void} settings.onSelect
   * @param {string} [settings.className] extra classes (`stack-action-menu`)
   */
  open({ x, y, items, onSelect, className = '' }) {
    closeMenu();
    this.className = `pile-action-menu card-context-menu ${className}`.trim();
    for (const item of items) this.append(item.node ?? this.#rowFor(item, onSelect));
    document.body.append(this);
    document.dispatchEvent(new Event(PILE_MENU_OPENED_EVENT));

    const rect = this.getBoundingClientRect();
    const position = clampMenuPosition(x, y, { width: rect.width, height: rect.height },
      { width: globalThis.innerWidth, height: globalThis.innerHeight });
    this.style.left = `${position.x}px`;
    this.style.top = `${position.y}px`;

    // Bound on the NEXT tick so the click (or `contextmenu`) that OPENED
    // this menu is not itself read as the outside click that closes it.
    setTimeout(() => {
      if (!this.isConnected) return;
      document.addEventListener('click', closeMenu, { once: true });
      document.addEventListener('keydown', dismissOnEscape);
    }, 0);
  }

  static close() {
    closeMenu();
  }

  #rowFor({ id, text, title, label, destructive, confirm, disabled }, onSelect) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pile-action-menu-item' + (destructive ? ' btn-danger' : '');
    // `title`/`aria-label` keep the bare name; the visible text carries the icon too.
    button.textContent = text;
    button.title = title;
    button.setAttribute('aria-label', label);
    // What a browser test clicks by: the row's own identity, stable across relabelling.
    button.dataset.action = id;
    button.disabled = disabled === true;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      closeMenu();
      if (destructive && !globalThis.confirm(`${confirm}\n\nContinue?`)) return;
      onSelect(id);
    });
    return button;
  }
}

function closeMenu() {
  // There is only ever one menu on the page: it is the one in the body.
  document.querySelector('action-menu')?.remove();
  document.removeEventListener('click', closeMenu);
  document.removeEventListener('keydown', dismissOnEscape);
}

function dismissOnEscape(event) {
  if (event.key === 'Escape') closeMenu();
}

customElements.define('action-menu', ActionMenuElement);
