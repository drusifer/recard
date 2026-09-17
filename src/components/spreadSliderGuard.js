/**
 * Split out of `SpreadSlider.js` so it can be unit-tested without a
 * DOM (`SpreadSlider.js` itself extends `HTMLElement`, which does not
 * exist under plain Node - same reason none of this project's other
 * Web Components carry unit tests, verified live in a browser instead).
 *
 * The user's own warning, reduced to its testable core: an external
 * (replicated-state) value update must never overwrite the slider's
 * displayed position while the user's own pointer is still down on it
 * - that's the drag-fighting bug this guard exists to prevent.
 */
export function shouldApplyExternalValue(isDragging) {
  return !isDragging;
}
