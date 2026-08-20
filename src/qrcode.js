/**
 * Join-code share helper. v1 ships the join code itself instead of a
 * scannable QR image (descoped 2026-08-15 — see CHAT.md Neo->Cypher: a
 * hand-rolled QR encoder couldn't be verified to actually scan in this
 * dev environment, and vendoring one would require a build step, which
 * ARCHITECTURE.md D1 rules out).
 *
 * The copy button copies the CODE, not a join URL (changed 2026-08-20 at
 * the user's direction). `buildJoinUrl` went with it — nothing generated
 * a share URL any more, and a helper with no callers is just a claim that
 * the feature still exists. Arriving on a `?join=<code>` link still works
 * exactly as before; `main.js` reads that query parameter independently.
 */

/**
 * Copy affordance, as an inline SVG rather than a character.
 *
 * Not a Unicode glyph (`⧉` U+29C9, `⎘` U+2398): both render inconsistently
 * or fall back to tofu in common UI fonts, and an unreliable icon is worse
 * than a word. Not `📋` either — an emoji is colour-fixed and reads as a
 * different visual language from the rest of this monochrome UI. Inline
 * SVG needs no build step (D1) and inherits `currentColor`, so it is
 * correct in both themes for free.
 */
const COPY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>';
const DONE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 6 9 17l-5-5"/></svg>';

const COPY_LABEL = 'Copy table code';

/**
 * Turns any button into the icon-only "copy the table code" control.
 *
 * The code, not a join URL: the code is what someone reads out, types in,
 * or pastes into a message — and it is the thing already printed next to
 * this button, so copying anything else makes the button lie about what it
 * is beside.
 *
 * An icon-only button has no text for a screen reader to announce, so the
 * `aria-label` IS the button's name here, not a nicety — and it flips to
 * "Copied" with the glyph so the confirmation reaches someone who cannot
 * see the tick.
 *
 * Assigns `onclick` rather than adding a listener: `showGameCode` re-runs
 * on every state broadcast, and `addEventListener` would stack a new
 * handler each time.
 */
export function wireCopyCode(btn, code) {
  btn.classList.add('icon-btn');
  btn.innerHTML = COPY_ICON;
  btn.setAttribute('aria-label', COPY_LABEL);
  btn.title = COPY_LABEL;
  btn.onclick = () => {
    navigator.clipboard?.writeText(code);
    btn.innerHTML = DONE_ICON;
    btn.setAttribute('aria-label', 'Copied');
    btn.title = 'Copied';
    setTimeout(() => {
      btn.innerHTML = COPY_ICON;
      btn.setAttribute('aria-label', COPY_LABEL);
      btn.title = COPY_LABEL;
    }, 1500);
  };
}

export function renderShareCode(container, { code }) {
  container.innerHTML = '';

  const codeEl = document.createElement('div');
  codeEl.className = 'share-code';
  codeEl.textContent = code;

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'copy-link-btn';
  wireCopyCode(copyBtn, code);

  container.append(codeEl, copyBtn);
}
