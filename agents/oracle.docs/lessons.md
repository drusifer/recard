# Project Lessons Learned

This file contains critical lessons and rules derived from past errors, technical discoveries, and architectural decisions. All agents MUST review this file before starting new implementation or architectural tasks.

---

## 2026-08-15 — Sprint 1 ("v1 playable deck") lessons

- **`node --test tests/` (directory form) fails to discover files in this
  environment** — even with `"type": "module"` in package.json, it throws
  `Cannot find module '.../tests'`. Use the glob form instead:
  `node --test tests/*.test.js` (this is what `npm test` and `npm run
  test:e2e` do). Check this before assuming a test runner problem is a
  real bug in the code under test.

- **Don't hand-roll a correctness-critical algorithm you can't verify.**
  A QR code encoder needs Reed-Solomon ECC and mask scoring to be
  scannable at all — a plausible-looking implementation that's subtly
  wrong is worse than no feature, and there was no scanner/camera in this
  environment to confirm one worked. When you can't verify a from-scratch
  implementation of something with a precise correctness bar, either
  vendor a real library or descope — don't ship an unverified guess. See
  `docs/DECISIONS.md` "QR code image descoped to v1.1".

- **"Not automatable in this environment" is worth re-checking before you
  accept it.** `docs/ARCHITECTURE.md` originally assumed the full P2P/
  WebRTC flow couldn't be automated and planned on manual two-tab
  verification. It turned out Playwright + a real Chromium build (system
  install, via `executablePath` fallback since the Playwright-managed
  browser build wasn't downloaded/version-matched here) could drive two
  real browser contexts through an actual PeerJS connection with no
  mocking. This caught two real bugs that pure code review missed:
  1. `session.js` stored a connection's status string and (via reaching
     into PeerJS's internal `peer.connections` map) its send-path in a way
     that collided/was fragile — found on Morpheus's phase-3 code review,
     not by a human eyeballing it twice.
  2. `main.js` never captured a *joining* player's own PeerJS id, so a
     guest's own hand count silently showed as 0 in their own roster view
     — only surfaced once the e2e test actually rendered a guest's screen
     and asserted on real DOM content.
  Prefer "let's actually try automating this" over accepting a testing-
  strategy limitation at face value, especially for anything with an
  external network/protocol dependency.

- **Playwright's `page.close()` can abruptly kill the render process
  without firing the page's unload lifecycle**, which meant a first
  attempt at testing "host tab closes -> others see session-ended" timed
  out at 60s+ with no signal. Navigating away first
  (`page.goto('about:blank')`) before closing triggers a real unload,
  which is what actually happens when a user closes a tab/browser — and
  the session-ended signal then arrived in ~100ms. If a disconnect/
  cleanup test hangs, check whether the test harness itself is skipping
  the lifecycle event the app depends on, before concluding the app is
  slow to detect disconnects.

---
