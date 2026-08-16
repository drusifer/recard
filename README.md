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
move cards, or tap + a "Move to…" menu if you'd rather · public,
face-down, and privately-owned face-down cards (community cards *and*
hole cards) · see other players actually dragging cards live, in real
time · quick-start presets for common games · simple +/- score tracking ·
an in-app rules reference · works solo for solitaire-type games too ·
sort your hand by rank/suit or drag to reorder, both persist ·
incremental "Deal More" mid-round · a self-toggle "Passed" marker.

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
```

`npm run test:e2e` needs a Chromium build Playwright can launch — either
run `npx playwright install chromium` once, or have a system Chromium/
Chrome installed (the test falls back to `/usr/bin/chromium`,
`/usr/bin/chromium-browser`, or `/usr/bin/google-chrome`).

## Known limitations

- **No reconnect.** If the host's tab closes, the session ends for
  everyone (you'll see an explicit "Host disconnected" message, not a
  silent freeze). If your own tab refreshes, you drop out of the table.
- **No QR code image.** Join via the code or the Copy Link button — a
  scannable QR was descoped for v1 (see `docs/USER_STORIES.md` Deferred/
  Stretch) rather than ship an unverifiable hand-rolled encoder.
- **No persistence.** Nothing survives past the browser tab being open.
- Soft cap of ~8 players; not enforced, just not tested past that. 1
  player (solo/solitaire) is explicitly supported at the other end.
- **On a phone screen specifically, the seated-players layout gets
  cramped from about 5 players on** — seat cards can overlap (measured,
  not just eyeballed: clean through 4 players, 1 overlapping pair at 5,
  worse by 8). A real, known gap, not silently accepted — see
  `docs/DECISIONS.md` v1.3 entry.

## How it works, briefly

- Host's browser is the hub (star topology) and holds the one true copy
  of the game state (deck, hands, table). Everyone else connects only to
  the host, never to each other.
- A player's hand is only ever sent to that player's own connection —
  never broadcast — so privacy holds at the data layer, not just the UI.
  The same rule extends to the shared "middle": a face-down card's
  rank/suit only ever reaches clients allowed to see it (nobody, for a
  shared face-down card; just its owner, for a private one) — never sent
  and hidden in the UI, actually never sent.
- Card movement (organizing your hand, or actually dragging a card on the
  table) shows up on other screens live, best-effort and throttled — a
  card you're not allowed to see stays an anonymous back the whole time
  it's moving, never just at rest.

Full rationale: `docs/ARCHITECTURE.md`.

## Documentation index

- [`docs/PRD.md`](docs/PRD.md) — product vision, scope, feasibility flags
- [`docs/USER_STORIES.md`](docs/USER_STORIES.md) — user stories + acceptance criteria
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — technical design (D1-D19), testing strategy
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — decision log with context/consequences
- [`task.md`](task.md) — sprint task board
- `agents/` — Bob Protocol persona docs, state, and team chat log (`agents/CHAT.md`)
