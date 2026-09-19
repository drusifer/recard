/**
 * `<table-talk>` (US-120/D138): the table-talk log and a line to say
 * something. Lines arrive host-ordered from `main.js` via `render()`;
 * saying emits a `talk-say` event rather than sending anything itself,
 * so this component knows nothing about the session.
 */
export class TableTalkElement extends HTMLElement {
  #log = null;

  connectedCallback() {
    if (this.#log) return;
    const heading = document.createElement('h2');
    heading.className = 'talk-heading';
    heading.textContent = 'Table talk';
    this.#log = document.createElement('ol');
    this.#log.className = 'talk-log';
    this.#log.setAttribute('aria-live', 'polite');

    const form = document.createElement('form');
    form.className = 'talk-form';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'talk-input';
    input.maxLength = 500;
    // Smith (D138 consult): say where the line goes.
    input.placeholder = 'Say to the table…';
    input.setAttribute('aria-label', 'Say to the table');
    const send = document.createElement('button');
    send.type = 'submit';
    send.textContent = 'Say';
    form.append(input, send);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      this.dispatchEvent(new CustomEvent('talk-say', { detail: { text }, bubbles: true }));
      input.value = '';
    });
    this.append(heading, this.#log, form);
  }

  /**
   * @param {Array<{ seq: number, name: string, text: string }>} entries
   */
  render(entries) {
    if (!this.#log) this.connectedCallback();
    this.#log.replaceChildren(...entries.map((entry) => {
      const line = document.createElement('li');
      line.className = 'talk-line';
      line.dataset.seq = String(entry.seq);
      const who = document.createElement('strong');
      who.textContent = `${entry.name}: `;
      line.append(who, entry.text);
      return line;
    }));
    this.#log.lastElementChild?.scrollIntoView?.({ block: 'nearest' });
  }
}

customElements.define('table-talk', TableTalkElement);
