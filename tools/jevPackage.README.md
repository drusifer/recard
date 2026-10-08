# Recard Jev players

This is the Jev bot processes from Recard, packaged by `make dist` as
`dist/jev/`. Copy this folder to any machine with Node 20+ (for example a
Raspberry Pi), and you can play against the bots or watch them play each other.

## Setup (once per machine)

```sh
npm run setup        # npm install --omit=dev + Playwright's Chromium
```

On a Pi, if Playwright can't download Chromium for your OS, install the
system browser instead (`sudo apt install chromium`). The bots fall back
to it automatically.

Strategies that ask Jev for judgments need a TypeSafe key in the
environment: `export TYPESAFE_API_KEY=...`. Rule-based strategies (all War
players, Gin's rule-list strategies, RtG's `rules`) need no key.

## Play: leave a game master listening, invite it from any table

```sh
npm run jev-game-master -- --name patch
```

It waits under that name (letters, digits and `-`; capitalisation doesn't
matter). At any table, anyone types `/invite patch` in table talk. The
table shows `inviting patch...`, then `patch is on its way`, and the game
master sits down as a spectator and offers "Add Jev bot" for whatever
game is on the table. It can be at several tables at once, and asking it
to leave one table doesn't affect the others. It keeps listening until
you press Ctrl-C.

If nothing answers within 15 seconds, the table says no game master by
that name answered. Check that it's running with that `--name`. If it
accepted but hasn't joined within 90 seconds, the table says so. The usual
cause is the box and the table running different Recard versions:
re-copy `dist/jev/` from the same `make dist` as the site you host from.

Only someone who knows the name can invite it, and there's no listing of
game masters. Treat the name like a light password: anyone who guesses
it can bring the game master to their table, and Jev strategies spend
the box's `TYPESAFE_API_KEY`. Starting a second game master under a name that's already listening fails at once
with "name taken".

## Play: bots join one table you name

Host a table in Recard on any device, then run one of these on the box:

```sh
# answers "add a Jev bot" / "quit" table talk for whatever game is on the table
npm run jev-game-master -- --code <TABLE CODE>

# or seat one specific bot
npm run jev-player -- --game gin --strategy jev-balanced --code <TABLE CODE>
```

## Watch: bots play each other

```sh
npm run jev-table -- --game gin            # or rtg / war; --players a,b to pick bots
```

It prints the table code and a `http://localhost:8230` URL. The server
listens on every interface, so from another device open
`http://<box hostname>:8230` (or join the code from any Recard copy) to
spectate. Ctrl-C makes every bot finish its move and leave before the
table closes.

Strategy names are the files in `games/<game>/players/`. Bot logs go to
`build/`.

## Container (a k3s workload)

`make export-jev-image` in the Recard repo builds this folder into an
arm64 image, `recard-jev:<VERSION>`, and saves it to
`dist/recard-jev-<VERSION>.tar` for a cluster to import (`VERSION`
defaults to `git describe`).

What the workload needs:

- **Default command:** a listening game master named by `GM_NAME`
  (default `patch`). Override the args to run something else, for example
  `node tools/jevTable.mjs --game gin` to host a table to watch.
- **Env:** `GM_NAME`; `TYPESAFE_API_KEY` from a secret, only for Jev
  strategies.
- **TURN relay (optional):** set `CLOUDFLARE_TURN_KEY_ID` and
  `CLOUDFLARE_TURN_KEY_API_TOKEN` (a Cloudflare Realtime TURN key, from a
  secret) and every WebRTC connection the pod makes is relayed through
  Cloudflare (`iceTransportPolicy: 'relay'`). Use it when the pod can't
  reach players directly: a LAN browser offers only mDNS candidates and
  most routers won't hairpin, and players behind CGNAT may have no
  direct path at all. Players' browsers need no change. At startup it
  mints credentials that last 24 h, prints
  `relaying WebRTC through Cloudflare TURN`, and refreshes them before
  they run out (a failed refresh keeps the current set and retries every
  minute). Each table and bot mints its own set when it starts. A wrong
  key exits at startup with Cloudflare's answer; setting only one of the
  two exits naming the missing one. Leave both unset for no relay.
- **Network:** outbound to the public PeerJS broker (`0.peerjs.com:443`)
  and WebRTC (STUN/UDP). With the TURN relay: HTTPS to
  `rtc.live.cloudflare.com` for credentials, and `turn.cloudflare.com` on
  UDP/TCP 3478 and TLS 5349/443. Nothing inbound, and no LAN access. Every mode also runs a small web server on port
  8230 that serves the Recard app to its own headless browsers. Expose
  8230 as a Service and people can open the app straight from the pod,
  then play, spectate or `/invite` the game master. That copy is always
  the same version as the bots, which avoids the `never-arrived`
  version mismatch. Leave it unexposed and nothing inbound is needed.
- **One replica.** A second pod with the same `GM_NAME` exits at startup
  with "name taken", so a Deployment with `replicas: 1` and
  `strategy: Recreate` avoids a rollout fight. Expect the new pod to need
  a few seconds after the old one stops, until the broker frees the name.
- **`/dev/shm`:** Chromium needs more than a pod's default 64 MB. Mount an
  `emptyDir` with `medium: Memory` (for example `sizeLimit: 256Mi`) at
  `/dev/shm`.
- **Resources:** each table it joins runs its own headless Chromium, and
  so does each bot. Budget about 200-300 MB of memory per table or bot.
- **Stop:** SIGTERM (pod stop) passes the stop on to every table it is at,
  and exits 143 well inside the default 30 s grace period.
- **User:** runs as `node` (uid 1000), and writes bot logs to
  `/app/build`. Mount a volume there to keep them.
