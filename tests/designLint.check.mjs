// Design lint: the runtime half of `designLint.mjs`'s pure assertions.
// Renders the real app at a set of real viewports and real game states,
// then runs the three standing checks - no forced page scroll, no
// overlapping zones, no undersized touch targets - and reports every
// violation found, exit code 1 if any exist. Meant to be run as its own
// `npm run lint:design`, alongside (not instead of) `npm run lint:style`
// - see `npm run lint` for both together.
//
// Deliberately separate from `tests/e2e.smoke.mjs`: that suite drives one
// specific, long, stateful play-through and takes ~5 minutes; this one
// exists to be the fast, always-run gate that catches "did this CSS
// change break the layout" without needing the full P2P flow. It boots a
// single host+guest pair once and sweeps viewports/states against it,
// rather than replaying the whole game per viewport.
//
// Added 2026-08-20, at the user's request, straight out of the previous
// session: three real UX regressions (seat-ring/pot overlap, forced page
// scroll, a self-inflicted `min-height: 0` bug) were each found by
// writing a one-off Node script with an inline geometry check, run once,
// then thrown away. This is that script, kept.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { isOverlapping, isWithinViewport, hasMinTouchTarget, pageOverflow } from './designLint.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 8211;
const BASE = `http://localhost:${PORT}`;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = http.createServer(async (request, response) => {
  const pathname = request.url.split('?', 1)[0];
  const filePath = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
  try {
    const body = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('not found');
  }
});
await new Promise((resolve) => server.listen(PORT, resolve));

// Same fallback as e2e.smoke.mjs: Playwright's bundled Chromium isn't
// always installed, so a system browser is an acceptable substitute.
const SYSTEM_CHROMIUM_PATHS = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
async function launchChromium() {
  try {
    return await chromium.launch({ args: ['--no-sandbox'] });
  } catch (error) {
    for (const executablePath of SYSTEM_CHROMIUM_PATHS) {
      try {
        return await chromium.launch({ executablePath, args: ['--no-sandbox'] });
      } catch { /* try the next candidate */ }
    }
    throw error;
  }
}

// The real viewports this project already treats as meaningful
// (D20/D24/US-31's own breakpoints, plus the common short-desktop-window
// sizes that the "table too big" regression actually broke at).
// Desktop/mouse-only for the current UI pass (direct user request) - no
// phone-width viewports here any more, so this gate doesn't fail on
// mobile-only layout debt nobody is chasing right now.
const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'desktop-1280x800', width: 1280, height: 800 },
  { name: 'laptop-1024x768', width: 1024, height: 768 },
];

const violations = [];
const report = (viewport, message) => { violations.push(`[${viewport}] ${message}`); };

const browser = await launchChromium();
try {
  const host = await (await browser.newContext()).newPage();
  const guest = await (await browser.newContext()).newPage();

  await host.goto(BASE);
  await host.click('#show-host');
  await host.fill('#host-name', 'Alice');
  await host.click('#create-table');
  await host.waitForSelector('#host-share:not([hidden])', { timeout: 20_000 });
  const code = (await host.locator('.share-code').textContent()).trim();

  await guest.goto(`${BASE}/?join=${encodeURIComponent(code)}`);
  await guest.fill('#join-name', 'Bob');
  await guest.click('#join-btn');
  await guest.waitForFunction(
    () => document.querySelector('#join-status').textContent.includes('Connected'),
    undefined, { timeout: 20_000 },
  );
  await host.fill('#cards-per-player', '7');
  await host.click('#deal-btn');
  // UX follow-up (direct user request): "get rid of seat panel and
  // replace with a reg zone with a handpile" (then "remember hand is a
  // pile not a zone") - there is no more `#hand-area`/own-zone special
  // case; a hand pile is a bare `[data-kind="hand"]` zone-panel now
  // (`src/components/PlayerZone.js` groups it with any other pile the
  // owner has), same generic `.middle-card .card` shape as any other
  // zone's cards. The host's own hand pile is created first (host joins/
  // deals before the guest), so it's the FIRST one in DOM order on the
  // host's own page.
  await host.waitForFunction(
    () => document.querySelector('[data-kind="hand"]')?.querySelectorAll('.card').length === 7,
    undefined, { timeout: 15_000 },
  );
  // A card in the pot, matching the state the original regression was
  // found under (an empty pot doesn't exercise the overlap check at all).
  // UX follow-up: the fan's tightened overlap (`.hand-card + .hand-card`
  // in style.css) now covers most of every card EXCEPT the last one in
  // DOM order (later siblings paint on top with no explicit z-index) -
  // `.first()`'s center point is genuinely obstructed by the card after
  // it, so Playwright's own default-center click times out waiting for
  // it to become clickable, matching what a real click there would hit.
  // `.last()` is always the fully unobstructed top card of the fan.
  //
  // UX follow-up (direct user request): clicks the `.middle-card`
  // WRAPPER now, not the inner `.card` button - a hand card's face is a
  // disabled button now that tap-to-play was retired (`cardEl`'s
  // `disabled` path, `ui.js`), which Playwright refuses to `.click()`.
  // The wrapper is what this check actually cares about anyway: is the
  // last fanned card obstructed by a sibling, not whether tapping it
  // does anything.
  await host.locator('zone-panel.seat-zone').first().locator('[data-kind="hand"] .middle-card').last().click();
  await host.waitForTimeout(300);

  for (const vp of VIEWPORTS) {
    await host.setViewportSize({ width: vp.width, height: vp.height });
    await host.waitForTimeout(150); // let layout settle

    const g = await host.evaluate(() => ({
      docScrollHeight: document.documentElement.scrollHeight,
      // UX follow-up (direct user request): no more single `#hand-area` -
      // every seated player's hand is its own bare `[data-kind="hand"]`
      // pile now, grouped into that player's own Zone (`<zone-panel
      // class="seat-zone">`, `src/components/ZonePanel.js`) alongside
      // any other pile that owner has. Checked for ALL of them (not
      // just "mine", which the DOM no longer marks distinctly), so this
      // stays a real check rather than silently matching nothing the
      // way the `#seat-zones`/`#table-area` selector below once did.
      handRects: [...document.querySelectorAll('[data-kind="hand"]')].map((element) => element.getBoundingClientRect()),
      // UX follow-up (real bug, found live): this selector still named
      // `#seat-zones`/`#table-area`, both retired by the DOM-flattening
      // pass ("table-surface -> #zones -> .zone", no more container
      // split) - since neither id exists any more, this had been
      // silently matching ZERO zones and reporting "no overlap" no
      // matter what, not because it was actually clean.
      //
      // UX follow-up (direct user request): "zone is one thing, pile is
      // another" - a Zone (`<zone-panel>`, one bordered/positioned panel
      // per Table Zone / player / standalone shared zone) is the ONLY
      // thing that ever carries `.zone` now; a Pile living inside one
      // (`<pile-panel>`) carries `.pile-section` instead, never `.zone`
      // - so this plain query already only ever matches independent
      // Zones, with no exclusion needed for a Zone's own members the
      // way an earlier cut of this check (when piles still borrowed the
      // `.zone` class) required.
      zones: [...document.querySelectorAll('#zones .zone')].map((element) => ({
        label: element.querySelector('.zone-name')?.textContent?.trim() || element.className,
        rect: element.getBoundingClientRect(),
      })),
      // `.card` buttons (the playing cards themselves) are deliberately
      // excluded: the user explicitly authorized shrinking them to fit
      // ("make cards smaller if you need to", 2026-08-20), so a generic
      // 44px floor written for small UI CONTROLS (the icon buttons this
      // rule was created for - Sprint 2 close-out) would contradict that
      // instruction rather than catch a regression. A card's tap target
      // is its whole face, already far larger in AREA than 44x44 even
      // when its width dips slightly under 44px on the smallest tested
      // viewport - a different shape of affordance, not an undersized
      // button.
      // D51 finding: `.action-btn` (a card's hover-revealed action row -
      // Turn over/Pick up/Move/Rotate/Play hidden) was ALWAYS exempt from
      // the 44px floor by design (style.css's own comment: "a HOVER-
      // revealed secondary path with an always-available alternative...
      // not the primary touch target the 44px floor exists to protect"),
      // but this checker never actually verified that exemption - it
      // never hovers anything, so `.action-btn` was always `display:none`
      // (0x0, filtered out below) at measurement time. Only surfaced now
      // because a viewport RESIZE mid-check leaves Playwright's virtual
      // mouse at its last (pre-resize) position, which can land on a
      // reflowed element and genuinely trigger `:hover` by accident -
      // exposing a real, pre-existing gap in this exemption, not a new
      // regression to fix in the app.
      // UX follow-up (direct user request, 2026-08-24): `.pile-action-btn`
      // (the icon buttons in pile/zone headers) is deliberately sized to
      // the title text, NOT the 44px floor - same "user explicitly
      // overrode it" reasoning as `.card` above, not a regression this
      // checker should flag. *nit (2026-08-26): `.card-action-btn` (the
      // card hover row's own buttons) no longer exists - the popup it
      // belonged to is deleted ("cards are Movable not Actionable").
      // *nit (2026-08-27): `.score-adjust-btn` (each player's own
      // +/-1/+/-10 row, `ScoreZone.js`) is the same small-content-sized
      // control, same exemption reasoning.
      buttons: [...document.querySelectorAll(
        'button:not([hidden]):not(.card):not(.action-btn):not(.pile-action-btn):not(.score-adjust-btn)',
      )]
        .filter((b) => {
          const r = b.getBoundingClientRect();
          return r.width > 0 && r.height > 0; // skip genuinely hidden/collapsed ones
        })
        .map((b) => ({
          label: b.id || b.textContent.trim().slice(0, 24) || b.getAttribute('aria-label') || '(unlabeled button)',
          rect: b.getBoundingClientRect(),
        })),
    }));

    // Check 1: no forced page scroll (the regression that started this).
    const overflow = pageOverflow(g.docScrollHeight, vp.height);
    if (overflow > 0) {
      report(vp.name, `page forces ${overflow}px of scroll (document ${g.docScrollHeight}px vs viewport ${vp.height}px)`);
    }

    // Check 2: every hand stays visible without scrolling - the user's
    // literal ask ("see the table and my cards at the same time").
    for (const rect of g.handRects) {
      if (!isWithinViewport(rect, { width: vp.width, height: vp.height })) {
        report(vp.name, 'a hand is not fully visible without scrolling');
        break;
      }
    }

    // Check 3: no zone (shared or personal) overlaps another - D24's
    // invariant, generalized to every zone pair instead of just seat-vs-pot.
    for (let index = 0; index < g.zones.length; index++) {
      for (let index_ = index + 1; index_ < g.zones.length; index_++) {
        if (isOverlapping(g.zones[index].rect, g.zones[index_].rect)) {
          report(vp.name, `zone "${g.zones[index].label}" overlaps zone "${g.zones[index_].label}"`);
        }
      }
    }

    // Check 4: every visible button clears the 44px touch-target floor.
    for (const button of g.buttons) {
      if (!hasMinTouchTarget(button.rect)) {
        report(vp.name, `button "${button.label}" is ${Math.round(button.rect.width)}x${Math.round(button.rect.height)}px, under the 44px floor`);
      }
    }
  }
} finally {
  await browser.close();
  server.close();
}

if (violations.length > 0) {
  console.error(`design-lint: ${violations.length} violation(s) found\n`);
  for (const v of violations) console.error(`  ✖ ${v}`);
  console.error('\nSee ARCHITECTURE.md UI Conventions (44px floor) and D24 (zone overlap) for the invariants being checked.');
  process.exit(1);
}
console.log(`design-lint: clean across ${VIEWPORTS.length} viewports (no forced scroll, no zone overlap, no undersized touch targets)`);
