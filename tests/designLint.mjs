/**
 * Design-lint: pure geometry assertions for catching UX regressions -
 * elements overlapping, layouts that force page scroll, touch targets
 * under the accessibility floor - as a standing, deterministic check
 * instead of something a human has to remember to test by hand.
 *
 * Added 2026-08-20 after a single CSS pass (the "table too big" fix)
 * both introduced and required hand-diagnosing exactly this class of
 * bug, live, with throwaway scripts: a self-inflicted `min-height: 0`
 * silently zeroed a layout floor, and the only thing that had ever
 * caught the resulting seat-ring/pot collision was ONE hand-rolled
 * intersection check inlined in a single e2e test (see D24 in
 * `tests/e2e.smoke.mjs`). This module is that pattern, extracted once,
 * unit-tested, and reusable everywhere the same question comes up.
 *
 * Pure and DOM-free, like `dropTarget.js`/`seating.js`/`pileActions.js`:
 * every function takes plain rects (e.g. straight off
 * `getBoundingClientRect()`, passed out of `page.evaluate()`), never
 * touches `document`/`window`. That is what makes it trivially
 * unit-testable in `tests/designLint.test.js` with no browser at all,
 * and reusable from any runner - a live-page check script
 * (`designLint.check.mjs`) here, or an assertion inside
 * `e2e.smoke.mjs`; nothing here cares which.
 */

/**
 * Strict rectangle intersection - merely touching edges does not count
 * as an overlap (matches the pre-existing D24 check this generalizes).
 * @param {{left:number,right:number,top:number,bottom:number}} a
 * @param {{left:number,right:number,top:number,bottom:number}} b
 */
export function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/**
 * Whether `rect` sits entirely inside a 0,0-origin `viewport` - the
 * standing check for "does reaching this force the page to scroll".
 * @param {{left:number,right:number,top:number,bottom:number}} rect
 * @param {{width:number,height:number}} viewport
 */
export function fitsViewport(rect, viewport) {
  return rect.top >= 0 && rect.left >= 0 && rect.bottom <= viewport.height && rect.right <= viewport.width;
}

/**
 * ARCHITECTURE.md UI Conventions: interactive elements are >=44x44px
 * (iOS HIG / Material minimum). This project has regressed it once
 * already (Sprint 2 close-out, `.fd-btn`/`.score-btn` measured ~25x20px
 * on a real device) - before that convention existed to cite against.
 * @param {{width:number,height:number}} rect
 * @param {number} [min]
 */
export function meetsMinTouchTarget(rect, min = 44) {
  return rect.width >= min && rect.height >= min;
}

/**
 * How far a document overflows its own viewport, in px. 0 or negative
 * means it fits without scrolling. Named and tested rather than
 * re-deriving `scrollHeight - innerHeight` at every call site, which is
 * how it got written three different ways across three throwaway
 * scripts in one afternoon before this module existed.
 * @param {number} documentScrollHeight
 * @param {number} viewportHeight
 */
export function pageOverflow(documentScrollHeight, viewportHeight) {
  return documentScrollHeight - viewportHeight;
}

/**
 * Checks every rect in `rects` pairwise for overlap and reports which
 * pairs collide, by label. Used where "does ANY seat zone overlap the
 * pot" needs to name the offender, not just say yes/no.
 * @param {{label: string, rect: {left:number,right:number,top:number,bottom:number}}[]} entries
 * @returns {{a: string, b: string}[]} colliding label pairs
 */
export function findOverlaps(entries) {
  const collisions = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      if (rectsOverlap(entries[i].rect, entries[j].rect)) {
        collisions.push({ a: entries[i].label, b: entries[j].label });
      }
    }
  }
  return collisions;
}
