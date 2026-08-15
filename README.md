# Recard

A shared virtual deck of cards for people playing a card game **in the
same room**, each on their own phone/laptop, with no server to run and no
accounts. Peer-to-peer over WebRTC. Recard doesn't referee any specific
game — it's a deck-and-table simulator you use alongside whatever game's
rules you already know.

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

## Known v1 limitations

- **No reconnect.** If the host's tab closes, the session ends for
  everyone (you'll see an explicit "Host disconnected" message, not a
  silent freeze). If your own tab refreshes, you drop out of the table.
- **No QR code image.** Join via the code or the Copy Link button — a
  scannable QR was descoped for v1 (see `docs/USER_STORIES.md` Deferred/
  Stretch) rather than ship an unverifiable hand-rolled encoder.
- **No persistence.** Nothing survives past the browser tab being open.
- Soft cap of ~8 players; not enforced, just not tested past that.

## How it works, briefly

- Host's browser is the hub (star topology) and holds the one true copy
  of the game state (deck, hands, table). Everyone else connects only to
  the host, never to each other.
- A player's hand is only ever sent to that player's own connection —
  never broadcast — so privacy holds at the data layer, not just the UI.
- Card movement (organizing your hand) shows up on other screens as a
  best-effort, throttled "organizing hand" cue — motion only, never card
  identity, and safe to drop frames of.

Full rationale: `docs/ARCHITECTURE.md`.

## Documentation index

- [`docs/PRD.md`](docs/PRD.md) — product vision, scope, feasibility flags
- [`docs/USER_STORIES.md`](docs/USER_STORIES.md) — user stories + acceptance criteria
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — technical design (D1-D6), testing strategy
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — decision log with context/consequences
- [`task.md`](task.md) — sprint task board
- `agents/` — Bob Protocol persona docs, state, and team chat log (`agents/CHAT.md`)
