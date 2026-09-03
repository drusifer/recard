/**
 * A token (D107, US-102). Same as `ChipPileable` in every behavioural
 * respect - which is to say, same as a card. It differs from a chip only
 * in carrying a short `label`, because a token in a real game is usually
 * marked ("+1", "poison") where a chip is identified by colour alone.
 *
 * `colour` and `label` are PRESENTATIONAL ONLY (Smith Gate 1 condition
 * A). The label is a mark, not a counter: nothing increments it, and
 * `sortActions` is empty so nothing orders by it. A token that counts is
 * a different feature and needs its own story - it was explicitly put
 * to the user and ruled out of this sprint.
 */
import { Pileable } from './Pileable.js';

export class TokenPileable extends Pileable {
  static sortActions = [];

  className() {
    return this.colour ? `card-token token-${this.colour}` : 'card-token';
  }

  render(element) {
    if (!this.label) return;
    const mark = document.createElement('span');
    mark.className = 'token-label';
    mark.textContent = this.label;
    element.append(mark);
  }
}
