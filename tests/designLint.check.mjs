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
import { rectsOverlap, fitsViewport, meetsMinTouchTarget, pageOverflow } from './designLint.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 8211;
const BASE = `http://localhost:${PORT}`;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = http.createServer(async (req, res) => {
  const pathname = req.url.split('?')[0];
  const filePath = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((resolve) => server.listen(PORT, resolve));

// Same fallback as e2e.smoke.mjs: Playwright's bundled Chromium isn't
// always installed, so a system browser is an acceptable substitute.
const SYSTEM_CHROMIUM_PATHS = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
async function launchChromium() {
  try {
    return await chromium.launch({ args: ['--no-sandbox'] });
  } catch (err) {
    for (const executablePath of SYSTEM_CHROMIUM_PATHS) {
      try {
        return await chromium.launch({ executablePath, args: ['--no-sandbox'] });
      } catch { /* try the next candidate */ }
    }
    throw err;
  }
}

// The real viewports this project already treats as meaningful
// (D20/D24/US-31's own breakpoints, plus the common short-desktop-window
// sizes that the "table too big" regression actually broke at).
const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'desktop-1280x800', width: 1280, height: 800 },
  { name: 'laptop-1024x768', width: 1024, height: 768 },
  { name: 'short-1280x720', width: 1280, height: 720 },
  { name: 'phone-390x844', width: 390, height: 844 },
  { name: 'phone-se-375x667', width: 375, height: 667 },
];

const violations = [];
const report = (viewport, message) => violations.push(`[${viewport}] ${message}`);

const browser = await launchChromium();
try {
  const host = await (await browser.newContext()).newPage();
  const guest = await (await browser.newContext()).newPage();

  await host.goto(BASE);
  await host.click('#show-host');
  await host.fill('#host-name', 'Alice');
  await host.click('#create-table');
  await host.waitForSelector('#host-share:not([hidden])', { timeout: 20000 });
  const code = (await host.locator('.share-code').textContent()).trim();

  await guest.goto(`${BASE}/?join=${encodeURIComponent(code)}`);
  await guest.fill('#join-name', 'Bob');
  await guest.click('#join-btn');
  await guest.waitForFunction(
    () => document.getElementById('join-status').textContent.includes('Connected'),
    undefined, { timeout: 20000 },
  );
  await host.fill('#cards-per-player', '7');
  await host.click('#deal-btn');
  await host.waitForFunction(() => document.querySelectorAll('#hand-area .card').length === 7, undefined, { timeout: 15000 });
  // A card in the pot, matching the state the original regression was
  // found under (an empty pot doesn't exercise the overlap check at all).
  await host.locator('#hand-area .card').first().click();
  await host.waitForTimeout(300);

  for (const vp of VIEWPORTS) {
    await host.setViewportSize({ width: vp.width, height: vp.height });
    await host.waitForTimeout(150); // let layout settle

    const g = await host.evaluate(() => ({
      docScrollHeight: document.documentElement.scrollHeight,
      handRect: document.getElementById('hand-area')?.getBoundingClientRect(),
      zones: [...document.querySelectorAll('#seat-zones .zone, #table-area .zone')].map((el) => ({
        label: el.querySelector('.zone-name')?.textContent?.trim() || el.className,
        rect: el.getBoundingClientRect(),
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
      buttons: [...document.querySelectorAll('button:not([hidden]):not(.card):not(.action-btn)')]
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

    // Check 2: the hand stays visible without scrolling - the user's
    // literal ask ("see the table and my cards at the same time").
    if (g.handRect && !fitsViewport(g.handRect, { width: vp.width, height: vp.height })) {
      report(vp.name, 'the hand is not fully visible without scrolling');
    }

    // Check 3: no zone (shared or personal) overlaps another - D24's
    // invariant, generalized to every zone pair instead of just seat-vs-pot.
    for (let i = 0; i < g.zones.length; i++) {
      for (let j = i + 1; j < g.zones.length; j++) {
        if (rectsOverlap(g.zones[i].rect, g.zones[j].rect)) {
          report(vp.name, `zone "${g.zones[i].label}" overlaps zone "${g.zones[j].label}"`);
        }
      }
    }

    // Check 4: every visible button clears the 44px touch-target floor.
    for (const btn of g.buttons) {
      if (!meetsMinTouchTarget(btn.rect)) {
        report(vp.name, `button "${btn.label}" is ${Math.round(btn.rect.width)}x${Math.round(btn.rect.height)}px, under the 44px floor`);
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
