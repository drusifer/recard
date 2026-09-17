/**
 * Tighten/Loosen slider (direct user request, 2026-09-13): one range
 * control replacing the separate Tighten/Loosen (and Tighten All/
 * Loosen All) buttons, shared between the per-stack gear menu and the
 * pile-level menu (`ui.js`'s `openStackActionMenu` and its pile-level
 * sibling).
 *
 * User's own design answers (via Smith's gate): updates fire live
 * while dragging, no numeric readout (handle position is the only
 * feedback), and this fully replaces the old buttons - no back-compat
 * shim kept alongside.
 *
 * The one real technical constraint the user flagged unprompted:
 * "don't let the slider move while the stack tighten/loosen or it
 * won't work" - the replicated spread value comes back from every
 * dispatch (this client's own included) and, naively reflected onto
 * the input's `value` on every re-render, would fight the browser's
 * own drag tracking on that same input. `shouldApplyExternalValue`
 * is the guard: while the user's own pointer is down on THIS
 * instance, external value updates are held rather than applied, and
 * only re-synced once the pointer lifts.
 */
import { shouldApplyExternalValue } from './spreadSliderGuard.js';

export class SpreadSliderElement extends HTMLElement {
  #input = null;
  #dragging = false;
  #pendingValue = null;

  connectedCallback() {
    if (this.#input) return;
    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'spread-slider-input';
    input.min = this.getAttribute('min') ?? '0';
    input.max = this.getAttribute('max') ?? '1';
    input.step = this.getAttribute('step') ?? 'any';
    if (this.hasAttribute('value')) input.value = this.getAttribute('value');

    const endDrag = () => {
      this.#dragging = false;
      if (this.#pendingValue !== null) {
        input.value = this.#pendingValue;
        this.#pendingValue = null;
      }
    };
    input.addEventListener('pointerdown', () => { this.#dragging = true; });
    input.addEventListener('pointerup', endDrag);
    input.addEventListener('pointercancel', endDrag);
    input.addEventListener('input', () => {
      this.dispatchEvent(new CustomEvent('spread-input', { detail: { value: Number(input.value) }, bubbles: true }));
    });

    this.#input = input;
    this.append(input);
  }

  get value() {
    const raw = this.#input ? this.#input.value : this.getAttribute('value') ?? 0;
    return Number(raw);
  }

  set value(newValue) {
    if (!this.#input) {
      this.setAttribute('value', newValue);
      return;
    }
    if (shouldApplyExternalValue(this.#dragging)) {
      this.#input.value = newValue;
    } else {
      this.#pendingValue = newValue;
    }
  }

  set max(newMax) {
    if (this.#input) this.#input.max = newMax;
    else this.setAttribute('max', newMax);
  }
}

customElements.define('spread-slider', SpreadSliderElement);
