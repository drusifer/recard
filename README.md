# Recard

A shared virtual deck of cards for people playing a card game **in the
same room**, each on their own phone/laptop, with no server to run and no
accounts. Peer-to-peer over WebRTC. Recard ships a small set of composable
primitives — deal, a private hand, play a card public/hidden-from-everyone/
hidden-but-mine, reveal, draw or pick up, a manual score — rather than any
one game's rules, so you use it alongside whatever game you already know
how to play.

**Features:** a top-down table with players seated around it (you're
always at the bottom of your own screen) · a personal area in front of
your seat for cards you've played, plus named shared zones (e.g. a
discard pile separate from a shared draw pile) · drag-and-drop to play or
move cards — with a mouse, or by holding a card and dragging it with your
finger on a phone or tablet — or tap + a "Move to…" menu if you'd rather · public,
face-down, and privately-owned face-down cards (community cards *and*
hole cards) · see other players actually dragging cards live, in real
time · quick-start presets for common games · simple +/- score tracking ·
an in-app rules reference · works solo for solitaire-type games too ·
sort your hand by rank/suit or drag to reorder, both persist ·
deal and re-deal straight from the deck itself · a self-toggle "Passed" marker · optionally start the game automatically once everyone you're expecting has joined · drag panels around the table and resize them to your own layout, remembered locally per browser · see every player's score, not just your own.

See `docs/PRD.md` for the product vision and `docs/ARCHITECTURE.md` for
the technical design.

## Run it locally

No build step — it's a static site.

```
npm run dev        # python3 -m http.server 8000
```

Then open `http://localhost:8000` in two browser tabs (or two devices on
the same Wi-Fi, pointed at your machine's LAN IP instead of localhost):
one to host a table, one to join with the code/link the host shows.

## Develop / test

```
npm test            # unit tests (deck, state, protocol) - node:test, no framework
npm run test:e2e     # real 2-browser Playwright smoke test over live PeerJS/WebRTC
npm run lint         # stylelint + design-lint (below) - the merge gate
npm run lint:style    # stylelint only, fast
npm run lint:design   # design-lint only - renders the real app and checks
                       # for forced page scroll, overlapping zones, and
                       # touch targets under 44px, across 6 real viewports
```

**`lint:design` currently reports 6 known violations** (down from 70 at
its first run, 2026-08-20) — all phone-width (390/375px) zone-overlap
cases, disclosed and tracked rather than silently accepted; see
`docs/ARCHITECTURE.md` D54 and `docs/USER_STORIES.md` Backlog. Wired in
as blocking rather than left silent so the count can't quietly grow
while it's unfixed.

`npm run test:e2e` needs a Chromium build Playwright can launch — either
run `npx playwright install chromium` once, or have a system Chromium/
Chrome installed (the test falls back to `/usr/bin/chromium`,
`/usr/bin/chromium-browser`, or `/usr/bin/google-chrome`).

## Known limitations

- **If the host's tab closes, the session ends for everyone** (you'll see
  an explicit "Host disconnected" message, not a silent freeze). A *host*
  who reloads is offered their table back; other players then rejoin with
  the code they already have.
- **A host reload no longer costs anyone their cards.** The saved table
  brings back zones, piles, scores *and* hands, reunited with their
  owners by the identity each browser holds (D27/D31). Players' clients
  reconnect on their own, the host sees who is still missing by name, and
  the game resumes once everyone is back — or the host can start without
  a straggler.
- **Hands are written to the host's own disk** (changed in v1.8, see
  `docs/ARCHITECTURE.md` D31, which reverses D26). Only ever the host's
  browser profile, never transmitted — but the snapshot does contain
  every player's cards, along with the deck's full remaining order. If
  you host on a shared machine, that is worth knowing.
- **No QR code image.** Join via the code or the Copy Link button — a
  scannable QR was descoped for v1 (see `docs/USER_STORIES.md` Deferred/
  Stretch) rather than ship an unverifiable hand-rolled encoder.
- Soft cap of ~8 players; not enforced, just not tested past that. 1
  player (solo/solitaire) is explicitly supported at the other end.
- **On a phone screen specifically, the seated-players layout gets
  cramped from about 5 players on** — seat cards can overlap (measured,
  not just eyeballed: clean through 4 players, 1 overlapping pair at 5,
  worse by 8). A real, known gap, not silently accepted — see
  `docs/DECISIONS.md` v1.3 entry.
- **With 3 or more players on a ~1024px-wide screen, a personal seat zone
  can overlap the shared pot.** Found during Sprint 9 while adding touch
  coverage; the D24 zone-size caps had only ever been measured against a
  two-player seat ring. Recorded rather than quietly left, and separate
  from the phone-density item above.
- **Multi-touch gestures (pinch, rotate) and long-press menus do
  nothing.** Touch support covers dragging cards; it isn't a full mobile
  gesture vocabulary.
- **Hand cards are not actually private from other players yet.** Since
  a player's seat became a real Pile in the shared zone pipeline,
  `handPile.redactCard` was never implemented — hand contents currently
  reach every viewer, not just their owner. The single biggest known
  gap as of `docs/ARCHITECTURE.md` D54; not yet fixed.
- **`tests/e2e.smoke.mjs` is out of date** relative to the current DOM
  (Zone/Pile split into Web Components, D54) — a dedicated update pass
  is still open.

## How it works, briefly

- Host's browser is the hub (star topology) and holds the one true copy
  of the game state (deck, hands, table). Everyone else connects only to
  the host, never to each other.
- The shared "middle" enforces privacy at the data layer, not just the
  UI: a face-down card's rank/suit only ever reaches clients allowed to
  see it (nobody, for a shared face-down card; just its owner, for a
  private one) — never sent and hidden in the UI, actually never sent.
  **Hand privacy is currently a known gap** (see Known limitations
  below) — this data-layer guarantee does not yet extend to hands.
- Card movement (organizing your hand, or actually dragging a card on the
  table) shows up on other screens live, best-effort and throttled — a
  card you're not allowed to see stays an anonymous back the whole time
  it's moving, never just at rest.

Full rationale: `docs/ARCHITECTURE.md`.

## Documentation index

- [`docs/PRD.md`](docs/PRD.md) — product vision, scope, feasibility flags
- [`docs/USER_STORIES.md`](docs/USER_STORIES.md) — user stories + acceptance criteria
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — technical design (D1-D54), testing strategy
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — decision log with context/consequences
- [`task.md`](task.md) — sprint task board
- `agents/` — Bob Protocol persona docs, state, and team chat log (`agents/CHAT.md`)
