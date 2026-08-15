/**
 * Join-code share helper. v1 ships join-code + Copy Link instead of a
 * scannable QR image (descoped 2026-08-15 — see CHAT.md Neo->Cypher: a
 * hand-rolled QR encoder couldn't be verified to actually scan in this
 * dev environment, and vendoring one would require a build step, which
 * ARCHITECTURE.md D1 rules out).
 */

export function buildJoinUrl(hostId) {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('join', hostId);
  return url.toString();
}

export function renderShareCode(container, { code, joinUrl }) {
  container.innerHTML = '';

  const codeEl = document.createElement('div');
  codeEl.className = 'share-code';
  codeEl.textContent = code;

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'copy-link-btn';
  copyBtn.textContent = 'Copy Link';
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(joinUrl).then(() => {
      copyBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyBtn.textContent = 'Copy Link';
      }, 1500);
    });
  });

  container.append(codeEl, copyBtn);
}
