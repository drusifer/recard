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
 * *nit fix (2026-08-26), real bug found live: `navigator.clipboard` is
 * only defined in a SECURE CONTEXT (`https:`, or `http://localhost`/
 * `127.0.0.1`) - and this app's own README tells a guest to open it at
 * the HOST'S LAN IP over plain `http://`, which is NOT one. On that
 * connection `navigator.clipboard` is `undefined`, so `?.writeText()`
 * silently no-ops - yet the button went straight to showing "Copied"
 * regardless, because nothing ever checked whether the write actually
 * happened. The button was lying, not "not copying" in some vaguer
 * sense - confirmed by instrumenting `writeText` live: it never even
 * exists to call on that exact connection.
 *
 * `copyText` is the fix, factored out so it's testable/reusable on its
 * own: try the modern Clipboard API when it exists; when it doesn't (or
 * it exists but the browser still rejects the call - a permission
 * prompt denial, for instance), fall back to the classic
 * select-a-hidden-textarea-and-`execCommand('copy')` trick, which is a
 * SYNCHRONOUS DOM API that still works in a non-secure context (that's
 * exactly why it's still worth keeping as a fallback despite being
 * deprecated - the modern replacement doesn't cover this real case).
 * Resolves `true`/`false` for whether it actually worked, never throws.
 */
export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied, or some other runtime rejection - fall
      // through to the legacy path rather than give up.
    }
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  // Off-screen, not `display: none` - a hidden element can't be
  // focused/selected, and `execCommand('copy')` only ever copies the
  // current selection.
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.setAttribute('readonly', '');
  document.body.append(textarea);
  textarea.select();
  textarea.setSelectionRange(0, text.length); // iOS Safari needs this explicitly, select() alone isn't enough
  let isCopied;
  try {
    isCopied = document.execCommand('copy');
  } catch {
    isCopied = false;
  }
  textarea.remove();
  return isCopied;
}

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
 * see the tick. *nit (2026-08-26): only flips to that state on a
 * CONFIRMED copy now (`copyText`'s real return value) - a failure flips
 * to an honest "Couldn't copy" instead, never a false positive.
 *
 * Assigns `onclick` rather than adding a listener: `showGameCode` re-runs
 * on every state broadcast, and `addEventListener` would stack a new
 * handler each time.
 */
export function wireCopyCode(button, code) {
  button.classList.add('icon-btn');
  button.innerHTML = COPY_ICON;
  button.setAttribute('aria-label', COPY_LABEL);
  button.title = COPY_LABEL;
  button.addEventListener('click', async () => {
    const ok = await copyText(code);
    button.innerHTML = ok ? DONE_ICON : COPY_ICON;
    const label = ok ? 'Copied' : "Couldn't copy - select and copy the code manually";
    button.setAttribute('aria-label', label);
    button.title = label;
    setTimeout(() => {
      button.innerHTML = COPY_ICON;
      button.setAttribute('aria-label', COPY_LABEL);
      button.title = COPY_LABEL;
    }, 1500);
  });
}

export function renderShareCode(container, { code }) {
  container.replaceChildren();

  const codeElement = document.createElement('div');
  codeElement.className = 'share-code';
  codeElement.textContent = code;

  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'copy-link-btn';
  wireCopyCode(copyButton, code);

  container.append(codeElement, copyButton);
}
