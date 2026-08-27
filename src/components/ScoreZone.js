/**
 * UX follow-up (direct user request): a native Web Component - standard
 * ECMAScript, `customElements`, light DOM (no shadow root) - is the
 * pattern for "special" zone panels now, replacing the bespoke
 * `renderScorePanel` pseudo-zone it grew out of. Chosen over React (this
 * project has no bundler/build step - `index.html` loads `<script
 * type="module">` directly) and over one more one-off DOM-building
 * function (the exact "own-zone-content" wrapper-div sprawl this same
 * follow-up asked to remove). No shadow root: every zone type shares
 * one global stylesheet (`style.css`'s `.zone`/`.zone-name`/
 * `.pile-action-btn` etc.) - a shadow root's style boundary would fight
 * that, not help it, so this stays LIGHT DOM and just participates in
 * the same global rules everything else does.
 *
 * A REAL sibling `.zone` panel now (previously `.score-zone`,
 * deliberately NOT `.zone` because it lived NESTED inside the owner's
 * merged own-zone panel, which broke `lint:design`'s zone-overlap
 * check). Now that it's a top-level sibling in `#zones` instead of
 * nested inside another zone, that nesting problem doesn't apply -
 * it's a real zone-shaped panel, not a lookalike.
 *
 * Communicates outward via a `CustomEvent` (`score-adjust`, detail
 * `{delta}`), the standard Web Component idiom for a component telling
 * its host something happened - not a callback prop, which isn't a
 * platform concept at all. `main.js` listens for it the same way it
 * listens for any other DOM event.
 */
export class ScoreZoneElement extends HTMLElement {
  static get observedAttributes() {
    return ['score', 'adjustable', 'label'];
  }

  connectedCallback() {
    // `wirePanelLayout` (ui.js) adds `.panel-resizable`/move wiring
    // separately, same as every other zone - this only owns the class
    // every zone panel needs at rest.
    this.classList.add('zone');
    this.#render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.#render();
  }

  get score() {
    return Number(this.getAttribute('score') ?? 0);
  }

  set score(value) {
    this.setAttribute('score', String(value));
  }

  get adjustable() {
    return this.hasAttribute('adjustable');
  }

  set adjustable(value) {
    this.toggleAttribute('adjustable', Boolean(value));
  }

  // UX follow-up (direct user request): "need a score zone for our
  // opponent" - more than one `<score-zone>` can exist on screen now
  // (the viewer's own, plus one per opponent), so each needs its own
  // title to tell them apart. Defaults to the original bare "Score" -
  // the viewer's own panel never sets this, so it's unchanged.
  get label() {
    return this.getAttribute('label') ?? 'Score';
  }

  set label(value) {
    this.setAttribute('label', value);
  }

  // *nit (2026-08-26), direct user request: "anything Actionable should
  // always get an ActionBar" - the +/- controls now go through the same
  // `<header-actions>`/`ACTION_SPECS` mechanism (`scoreDown`/`scoreUp`,
  // `pileActions.js`) every other pile/zone heading uses, instead of a
  // bespoke hand-built header. `panel-title` is still the heading class
  // (`wirePanelLayout` still wires resize/starting-position off it).
  #render() {
    this.replaceChildren();

    const heading = document.createElement('header-actions');
    this.append(heading);
    heading.render(this.label, this.adjustable ? ['scoreDown', 'scoreUp'] : [], {
      headingClass: 'panel-title',
      onAction: (id) => {
        this.dispatchEvent(new CustomEvent('score-adjust', { detail: { delta: id === 'scoreUp' ? 1 : -1 }, bubbles: true }));
      },
    });

    const value = document.createElement('div');
    value.className = 'score-value';
    value.textContent = String(this.score);
    this.append(value);
  }
}

customElements.define('score-zone', ScoreZoneElement);
