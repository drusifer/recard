/**
 * `<thought-bubble>` (US-121/D142): what a Jev bot just chose, on its
 * seat, expanding into its whole decision history.
 *
 * Open/close follows pile focus-zoom's CLICK model, deliberately not
 * its pointer model (Smith, Gate 1 condition 1): a click opens it, a
 * click outside closes it, and `pointerleave` does NOT - the expanded
 * bubble holds a scrolling history, and closing it when the pointer
 * drifts past an edge destroys the reading position.
 *
 * It knows nothing about the session or the talk log: `render()` hands
 * it the decisions, and opening/closing is reported as `thought-toggle`
 * so `main.js` can remember which bubble is open across the re-render
 * every broadcast causes.
 */
import { clampOverlayPosition } from '../focusZoom.js';

const WIDTH = 340;
const MAX_HEIGHT = 420;

export class ThoughtBubbleElement extends HTMLElement {
  #summary = null;
  #panel = null;
  #decisions = [];
  #open = false;
  #onDocumentClick = null;

  connectedCallback() {
    if (this.#summary) return;
    this.#summary = document.createElement('button');
    this.#summary.type = 'button';
    this.#summary.className = 'thought-summary';
    this.#summary.addEventListener('click', (event) => {
      event.stopPropagation(); // this click must not immediately count as "outside"
      this.toggle(!this.#open);
    });
    this.#panel = document.createElement('div');
    this.#panel.className = 'thought-panel';
    this.#panel.hidden = true;
    // Clicks inside the history (scrolling, selecting text) are not
    // clicks outside it.
    this.#panel.addEventListener('click', (event) => event.stopPropagation());
    this.append(this.#summary, this.#panel);
  }

  disconnectedCallback() {
    this.#unwatch();
    // Every broadcast rebuilds the seat panels; a panel parked on
    // `body` would outlive its bubble and strand itself on screen.
    this.#panel?.remove();
  }

  #unwatch() {
    if (!this.#onDocumentClick) return;
    document.removeEventListener('click', this.#onDocumentClick);
    this.#onDocumentClick = null;
  }

  /** Opens or closes, placing the panel so it stays on screen. */
  toggle(open) {
    this.#open = open;
    this.#panel.hidden = !open;
    this.classList.toggle('thought-open', open);
    this.#unwatch();
    if (open) {
      // The table's own zoom/pan transform (`#zones`) makes a
      // `position: fixed` descendant fixed to THAT box, not the
      // viewport - so an open panel lives on `body` while it is open,
      // the same move the focus-zoom overlay already makes. Found by
      // looking at the table: the panel hung off the screen's edge.
      document.body.append(this.#panel);
      this.#place();
      this.#onDocumentClick = () => this.toggle(false);
      document.addEventListener('click', this.#onDocumentClick);
    }
    if (!open && this.#panel.parentElement !== this) this.append(this.#panel);
    this.dispatchEvent(new CustomEvent('thought-toggle', { detail: { open }, bubbles: true }));
  }

  #place() {
    // Size it FIRST, then measure what the browser actually laid out -
    // `scrollHeight` read before the panel has its width and max-height
    // is a guess, and a guess here means a history clipped off the
    // bottom of the screen (seen on a real table, not in a test).
    this.#panel.style.width = `${WIDTH}px`;
    this.#panel.style.maxHeight = `${MAX_HEIGHT}px`;
    this.#panel.style.left = '0px';
    this.#panel.style.top = '0px';
    const rect = this.#summary.getBoundingClientRect();
    const height = Math.min(MAX_HEIGHT, this.#panel.getBoundingClientRect().height || MAX_HEIGHT);
    // Same clamp the focus-zoom overlay uses, so a bubble on a seat at
    // the edge of the table stays fully on screen (D142).
    const { left, top } = clampOverlayPosition(rect, { width: WIDTH, height }, { width: innerWidth, height: innerHeight });
    this.#panel.style.left = `${left}px`;
    this.#panel.style.top = `${top}px`;
  }

  /**
   * @param {{ decisions: object[], open?: boolean }} view newest decision last
   */
  render({ decisions = [], open = false } = {}) {
    if (!this.#summary) this.connectedCallback();
    this.#decisions = decisions;
    const latest = decisions.at(-1);
    this.hidden = !latest; // nothing decided yet, nothing to show (AC6)
    if (!latest) {
      if (this.#open) this.toggle(false);
      return;
    }
    this.#summary.textContent = `\u{1F4AD} ${latest.text}`;
    this.#summary.setAttribute('aria-label', `What ${this.dataset.who ?? 'this bot'} is thinking: ${latest.text}`);
    this.#panel.replaceChildren(...decisions.map((decision) => entryElement(decision)));
    if (open !== this.#open) this.toggle(open);
    // Newest at the bottom and in view; earlier ones are up the scroll.
    if (this.#open) this.#panel.lastElementChild?.scrollIntoView?.({ block: 'nearest' });
  }
}

function line(className, text) {
  const element = document.createElement('div');
  element.className = className;
  element.textContent = text;
  return element;
}

function entryElement(decision) {
  const item = document.createElement('article');
  item.className = 'thought-entry';
  item.dataset.seq = String(decision.seq ?? '');
  item.append(line('thought-move', `${decision.text} — hand ${decision.handNumber ?? '?'}, ${decision.strategy ?? 'bot'}`));

  const fired = decision.trace?.find((step) => step.fired);
  if (fired) item.append(line('thought-rule', `Rule: ${fired.rule}${fired.why ? ` — ${fired.why}` : ''}`));
  const considered = decision.trace?.filter((step) => !step.fired).map((step) => step.rule) ?? [];
  if (considered.length) item.append(line('thought-considered', `Also weighed: ${considered.join(', ')}`));

  if (decision.judgments) {
    const { threat, helps } = decision.judgments;
    item.append(line('thought-jev', `Jev: opponent threat ${Number(threat).toFixed(1)}`));
    for (const [card, score] of Object.entries(helps ?? {})) {
      item.append(line('thought-jev-help', `  ${card} helps them: ${Number(score).toFixed(2)}`));
    }
  }
  if (decision.facts) {
    item.append(line('thought-facts', `Deadwood ${decision.facts.deadwood}, stock ${decision.stockCount ?? '?'}, they hold ${decision.opponentHandSize ?? '?'}`));
  }
  if (decision.hand) item.append(line('thought-hand', `Hand: ${decision.hand.join(' ')}`));
  return item;
}

customElements.define('thought-bubble', ThoughtBubbleElement);
