/**
 * `<add-bot>` (US-122/D143): asks a Jev player that is already at the
 * table to deal in another bot. Rendered only while such a player is
 * there to answer (`botOffers`) - anyone at the table may use it
 * (player or spectator, user 2026-09-19).
 *
 * Knows nothing about the session: it emits `add-bot` with the chosen
 * game and strategy, and `main.js` says the line. The in-flight state
 * is its own (Smith, Gate 1 condition 3 - pressing it must visibly do
 * something, since a bot takes seconds to sit down).
 */
export class AddBotElement extends HTMLElement {
  #select = null;
  #button = null;
  #status = null;
  #offer = null;

  connectedCallback() {
    if (this.#select) return;
    const heading = document.createElement('h2');
    heading.className = 'add-bot-heading';
    heading.textContent = 'Add a Jev bot';
    this.#select = document.createElement('select');
    this.#select.className = 'add-bot-strategy';
    this.#select.setAttribute('aria-label', 'Strategy for the new bot');
    this.#button = document.createElement('button');
    this.#button.type = 'button';
    this.#button.className = 'add-bot-btn';
    this.#button.textContent = 'Add bot';
    this.#status = document.createElement('p');
    this.#status.className = 'add-bot-status';
    this.#status.setAttribute('aria-live', 'polite');
    this.#button.addEventListener('click', () => this.#ask());
    const row = document.createElement('div');
    row.className = 'add-bot-row';
    row.append(this.#select, this.#button);
    this.append(heading, row, this.#status);
  }

  #ask() {
    const strategy = this.#select.value;
    if (!strategy || !this.#offer) return;
    this.#button.disabled = true;
    // Named, not "working…": the bot joins over the real network, so
    // the person needs to know WHO was asked and WHAT for while they
    // wait for a seat to fill.
    this.#status.textContent = `Asking ${this.#offer.name} for a ${strategy} bot…`;
    this.dispatchEvent(new CustomEvent('add-bot', {
      detail: { game: this.#offer.games[0], strategy, by: this.#offer.name }, bubbles: true,
    }));
  }

  /**
   * @param {{ offer: import('../botOffers.js').BotOffer|null, status: string }} view
   *   `offer` null hides the control entirely - there is nothing that
   *   could answer. `status` is whatever the last request came to.
   */
  render({ offer, status } = {}) {
    if (!this.#select) this.connectedCallback();
    this.hidden = !offer;
    if (!offer) return;
    this.#offer = offer;
    const chosen = this.#select.value;
    this.#select.replaceChildren(...offer.strategies.map(({ name, description }) => {
      const option = document.createElement('option');
      option.value = name;
      // Gate 2 condition b: a bare "equilibrium" means nothing at
      // first sight - the strategy's own description rides along.
      option.textContent = description ? `${name} - ${description}` : name;
      return option;
    }));
    if (chosen && offer.strategies.some((s) => s.name === chosen)) this.#select.value = chosen;
    if (status !== undefined) {
      this.#status.textContent = status;
      this.#button.disabled = status.startsWith('Asking');
    }
  }
}

customElements.define('add-bot', AddBotElement);
