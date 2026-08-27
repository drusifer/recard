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
 * *nit (2026-08-27), direct user request: "save space" - ONE panel now
 * lists EVERY seated player's score (previously one whole `.zone` panel
 * per player, each fighting the seat ring for clearance - see the
 * `git log` on this file for that short-lived design and the
 * `zone-drop-gutter`/positioning saga it caused). The
 * attribute-per-scalar API (`score`/`adjustable`/`label`) that suited a
 * single player doesn't extend to a list, so this is a `.render(players,
 * options)` method now, the same shape `<zone-panel>` already uses -
 * fully replaced, no attribute API kept around for compatibility (no
 * backward-compat shims in this codebase).
 */
export class ScoreZoneElement extends HTMLElement {
  connectedCallback() {
    // `wirePanelLayout` (`ui.js`) adds `.panel-resizable`/move wiring
    // separately, same as every other zone - this only owns the class
    // every zone panel needs at rest.
    this.classList.add('zone');
  }

  /**
   * @param {{id: string, name: string, score: number}[]} players every
   *   seated player with a score entry, in seat order ("You" first).
   * @param {{onAdjust?: (id: string, delta: number) => void,
   *          onSet?: (id: string, value: number) => void}} options
   *   either callback being absent renders that control disabled -
   *   the inert "session ended" case this panel already needed.
   */
  render(players, options = {}) {
    this.replaceChildren();

    const heading = document.createElement('header-actions');
    this.append(heading);
    // No per-row actions live in the title bar any more (D57's own
    // "anything Actionable gets an ActionBar" was about a SINGLE
    // player's +/-; each row below now carries its own four buttons,
    // which don't fit a shared title-bar action list) - just the
    // heading text and the drag handle `wirePanelLayout` still needs.
    heading.render('Scores', [], { headingClass: 'panel-title' });

    const rows = document.createElement('div');
    rows.className = 'score-rows';
    this.append(rows);

    for (const player of players) {
      rows.append(this.#renderRow(player, options));
    }
  }

  #renderRow(player, options) {
    const row = document.createElement('div');
    row.className = 'score-zone-row';

    const name = document.createElement('span');
    name.className = 'score-row-name';
    name.textContent = player.name;
    row.append(name);

    const adjustButton = (label, delta) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'score-adjust-btn';
      button.textContent = label;
      button.disabled = !options.onAdjust;
      button.addEventListener('click', () => options.onAdjust?.(player.id, delta));
      return button;
    };

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'score-input';
    input.value = String(player.score);
    input.disabled = !options.onSet;
    // Same "cancel is a valid outcome" spirit as every other inline edit
    // in this codebase (a pile/zone rename, the split/take confirm
    // dialogs): blank or unchanged reverts silently rather than
    // round-tripping a no-op through the network.
    const commit = () => {
      // A blank field is a real, distinct third case, not just "0" -
      // `Number('')` is `0`, so without this it would silently ZERO an
      // existing non-zero score instead of reverting (caught live: typed
      // 55, cleared the field, blurred - committed 0). Blank reverts,
      // same as every other cancel-is-valid inline edit in this codebase.
      if (input.value.trim() === '') { input.value = String(player.score); return; }
      const parsed = Number(input.value);
      if (Number.isSafeInteger(parsed) && parsed !== player.score) options.onSet?.(player.id, parsed);
      else input.value = String(player.score);
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); input.blur(); }
      else if (event.key === 'Escape') { input.value = String(player.score); input.blur(); }
    });
    // A drag on the containing heading (Zone move) shouldn't start from
    // here - same guard `renderActionHeader`'s own rename input uses.
    input.addEventListener('mousedown', (event) => event.stopPropagation());

    row.append(adjustButton('-10', -10), adjustButton('-1', -1), input, adjustButton('+1', 1), adjustButton('+10', 10));
    return row;
  }
}

customElements.define('score-zone', ScoreZoneElement);
