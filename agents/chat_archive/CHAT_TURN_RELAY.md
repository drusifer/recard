# CHAT_TURN_RELAY — Sprint Archive

## Summary

US-151/152 sprint (Tier 2, D176): with CLOUDFLARE_TURN_KEY_ID/_API_TOKEN set, the Jev game master mints Cloudflare Realtime TURN credentials per process (children/bots mint their own), passes them to its headless pages as a peerConfig URL param (relay-only), and pushes refreshes into the long-lived listener via a JSHandle. Port-53 URLs filtered. Static server now refuses path traversal (404) and malformed % (400). Gates green: make check, test-gmlisten, test-jev-game-master; image exported as dist/recard-jev-36810d8-dirty.tar (same tag as before - rebuild after commit). Not live-tested against Cloudflare (no key). Uncommitted.

---
[<small>2026-10-06 22:56:52</small>] [**Smith**]->[**all**] *user approve*:
 *user approve US-150. Evidence: live suites driving the real app (test-gminvite 3/3: usage, inviting->no-answer seen by a 2nd viewer, accepted->never-arrived; test-gmlisten: mixed-case invite from 2 tables, bot added, quit stays local, name taken). No separate hands-on session (user skipped the gate). C1-C4 + Gate 2 wording met. Minor, backlogged: status lines show under the inviter's name ('Guest: inviting patch...'), same as /roll results - reads a bit like the guest said it. @all *sprint retro

---
[<small>2026-10-06 22:56:52</small>] [**Neo**]->[**Cypher**] *retro*:
 Neo retro: invite flow kept pure (runInvite/hasArrived) so main.js only gained wiring; reused --code mode as a child instead of a multi-table page. Friction: 5-browser live test exposed a join flake I couldn't root-cause. Backlog: flaky-join root cause.

---
[<small>2026-10-06 22:56:52</small>] [**Trin**]->[**Cypher**] *retro*:
 Trin retro: 2 new live suites + 8 unit tests, 3 mutation checks (ordinary-chat guard, arrival watch, name-taken). Regression gate incomplete by user call; harness-mcp shown pre-existing via HEAD worktree. Backlog: fix harness-mcp + its orphaned peerjs; finish US-150 gate.

---
[<small>2026-10-06 22:56:52</small>] [**Morpheus**]->[**Cypher**] *retro*:
 Morpheus retro: D175 held up unchanged through build - address-as-peer-id needed no new infra. Revisit: joinTable retry is a symptom fix; if the mDNS suspicion is confirmed, prefer a launch flag over retries.

---
[<small>2026-10-06 22:56:52</small>] [**Oracle**]->[**Cypher**] *retro*:
 Oracle retro: decisions recorded in-turn (D174, D175 + 2 amendments). Gap: the harness-mcp failure went unnoticed since US-119 because no gate runs it routinely. Backlog item filed.

---
[<small>2026-10-06 22:56:52</small>] [**Mouse**]->[**Cypher**] *retro*:
 Mouse retro: 4 phases of 1-3 tasks, no fix loops on the feature; one escalation (flaky join) resolved by user decision. Gate run cut short by user - logged in task.md + BACKLOG.

---
[<small>2026-10-06 22:56:52</small>] [**Cypher**]->[**Cypher**] *retro*:
 Cypher retro: asking the 2 real product questions up front (addressing, trigger) avoided rework; slash form /invite was right (no accidental summons). Backlog: table-voice status lines (Smith).

---
[<small>2026-10-06 22:56:53</small>] [**Smith**]->[**Cypher**] *retro*:
 Smith retro: C1 ack + Gate 2 recovery wording made failures self-explaining. UX theme: host-generated talk lines need their own voice.

---
[<small>2026-10-06 22:56:53</small>] [**Tank**]->[**Cypher**] *retro*:
 Tank retro: dist/jev/ now carries listening mode; README covers /invite and both bounds. Next infra: make deploy-jev HOST=... and a systemd unit so the Pi's listener survives reboots - waiting on the Pi's hostname.

---
[<small>2026-10-06 22:57:01</small>] [**Cypher**]->[**all**] *pm launch*:
 *pm launch US-150: '/invite <name>' in table talk brings a listening Jev game master (jev-game-master --name <name>, shipped in dist/jev/) to any table - no codes, no SSH. Retro items added to BACKLOG (harness-mcp at HEAD, flaky-join root cause, unfinished gate, table-voice status lines, Tank: deploy-jev + systemd). Sprint complete; nothing committed - user's call.

---
[<small>2026-10-07 14:29:40</small>] [**make**]->[**all**] *build*:
 Build PASSED | make check-decisions | /home/drusifer/Projects/recard/build/build.out
No duplicate decision numbers, and the modern section is newest-first. Clean.

---
[<small>2026-10-07 14:29:40</small>] [**User**]->[**Tank**] *report*:
 test-jev-image passed (user ran it)

---
[<small>2026-10-07 14:29:49</small>] [**Tank**]->[**User**] *devops handoff*:
 Image work done, state saved. Tar: dist/recard-jev-36810d8-dirty.tar (rebuild after commit for a clean tag). Handoff: user configures the pi-patch workload. @User

---
[<small>2026-10-07 16:16:36</small>] [**User**]->[**Oracle**] *request*:
 /oracle groom docs

---
[<small>2026-10-07 16:24:04</small>] [**make**]->[**all**] *build*:
 Build PASSED | make export-jev-image | /home/drusifer/Projects/recard/build/build.out
Image exported to dist/recard-jev-36810d8-dirty.tar
Image: recard-jev:36810d8-dirty - workload notes in dist/jev/README.md (Container section)

---
[<small>2026-10-07 16:24:20</small>] [**Oracle**]->[**User**] *ora handoff*:
 Groomed: README no longer claims make check skips lint (stale since dd67b83); added Deploying section (dist/, dist/jev/, export-jev-image, pi-patch) + jev package README in doc index. Fixed jev README: every mode serves the app on 8230, not just jev-table. Chose to document 'make dist wipes the tar, export last' over changing dist to keep it (dist clearing itself is deliberate, D174). Re-exported the tar. States saved. @User ready to exit; tree uncommitted - your call.

---
[<small>2026-10-07 19:42:04</small>] [**User**]->[**all**] *request*:
 /bob-protocol init

---
[<small>2026-10-07 19:42:08</small>] [**Mouse**]->[**User**] *sm init*:
 Init: cold start reconciled. Last handoff Oracle->User (docs groomed, ready to exit). No persona has pending work; US-150 shipped, jev image exported. Open: uncommitted tree (user's call), BACKLOG items from US-150 retro (harness-mcp failing at HEAD, flaky-join root cause, unfinished regression gate, table-voice status lines, deploy-jev+systemd). Awaiting user direction.

---
[<small>2026-10-07 19:42:19</small>] [**User**]->[**all**] *request*:
 /sprint Cloudflare Realtime TURN relay for the Jev game master (pod-side only; env-gated; refresh before TTL; children get fresh set) + fix startStaticServer path traversal. Done: test-jev-game-master/test-gmlisten pass, export-jev-image.

---
[<small>2026-10-07 19:44:33</small>] [**Morpheus**]->[**Smith**] *lead decision*:
 US-151 (TURN relay, env-gated, refresh before TTL, listener updated in place) + US-152 (static server containment, 400 on bad %) written: docs/USER_STORIES.md tail. Arch D176: per-process lazy relay from env (children/bots mint their own; rejected passing creds on argv - stale + visible in ps); config into pages via peerConfig URL param read by peerOptionsFromSearch (rejected init-script global). Full: docs/DECISIONS.md D176. @Smith *user review

---
[<small>2026-10-07 19:44:42</small>] [**Smith**]->[**Mouse**] *user approve*:
 *user approve US-151/152 + D176. Conditions: C1 startup line names the relay and TTL but never echoes the token; C2 half-set env error names the MISSING variable; C3 README says what egress TURN needs (UDP/TCP 3478, TLS 5349/443 to Cloudflare). @Mouse *sm plan sprint

---
[<small>2026-10-07 19:44:42</small>] [**Mouse**]->[**Neo**] *sm handoff*:
 Planned 3 phases in task.md (relay core; wiring+containment+README; gate). @Neo *swe impl phase-1

---
[<small>2026-10-07 19:45:46</small>] [**Neo**]->[**Trin**] *swe handoff*:
 Phase 1 done (TDD): tools/turnRelay.mjs + 11 unit tests; peerOptions peerConfig + withPeerConfig, 3 round-trip tests. @Trin *qa uat phase-1

---
[<small>2026-10-07 19:46:04</small>] [**make**]->[**all**] *build*:
 Build PASSED | make test | /home/drusifer/Projects/recard/build/build.out
ℹ tests 1273
ℹ suites 0
ℹ pass 1273
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 17109.828692

---
[<small>2026-10-07 19:46:14</small>] [**Trin**]->[**Morpheus**] *qa handoff*:
 UAT phase 1 PASS: make test green; mutation (drop refresh listener notify) caught by the refresh test. @Morpheus *lead review phase-1

---
[<small>2026-10-07 19:46:14</small>] [**Morpheus**]->[**Neo**] *lead handoff*:
 Phase 1 review PASS: matches D176 (env gate, :53 filter, 80% refresh, keep-on-fail). peerConfig overrides local empty ICE list uniformly - no broker special case. @Neo *swe impl phase-2

---
[<small>2026-10-07 19:47:22</small>] [**make**]->[**all**] *build*:
 Build PASSED | make test-gmlisten | /home/drusifer/Projects/recard/build/build.out
ℹ tests 3
ℹ suites 0
ℹ pass 3
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 15994.369652

---
[<small>2026-10-07 19:47:34</small>] [**Neo**]->[**Trin**] *swe handoff*:
 Phase 2 done: openPeer adds peerConfig from sharedTurnRelay; listener page takes refreshes into peer.options.config (new gmlisten test); jevGameMaster mints at startup + prints relay line (no token); static server containment/400/bound port (6 tests); README Container: both vars + TURN egress (Smith C3). @Trin *qa uat phase-2

---
[<small>2026-10-07 19:51:49</small>] [**make**]->[**all**] *build*:
 Build PASSED | make check | /home/drusifer/Projects/recard/build/build.out
7:51PM INF no leaks found
7:51PM INF 1 commits scanned.
7:51PM INF scanned ~96797 bytes (96.80 KB) in 290ms
7:51PM INF no leaks found

---
[<small>2026-10-07 19:51:55</small>] [**Trin**]->[**Morpheus**] *qa handoff*:
 UAT phase 2 PASS: make check clean. Mutations: dropping the containment guard fails 4 traversal tests (first cut didn't climb to / - tightened to 16 levels); dropping the listener config write fails the refresh test. @Morpheus *lead review phase-2

---
[<small>2026-10-07 19:51:55</small>] [**Morpheus**]->[**Trin**] *lead decision*:
 Phase 2 review PASS. Lint pushed the listener off a page global onto a JSHandle {listening, ready} - better than D176 text (no hidden page state). listenAsGameMaster's 'relay' param is test injection, defaults to sharedTurnRelay. @Trin *qa gate phase-3

---
[<small>2026-10-07 20:00:02</small>] [**make**]->[**all**] *build*:
 Build PASSED | make export-jev-image | /home/drusifer/Projects/recard/build/build.out
Image exported to dist/recard-jev-36810d8-dirty.tar
Image: recard-jev:36810d8-dirty - workload notes in dist/jev/README.md (Container section)

---
[<small>2026-10-07 20:00:27</small>] [**Oracle**]->[**all**] *ora handoff*:
 Groomed: lessons.md (traversal tests must reach a real file; JSHandle over page globals), D176 amended for the JSHandle. task.md closed. @Smith *user test

---
[<small>2026-10-07 20:00:27</small>] [**Smith**]->[**all**] *user approve*:
 C1-C3 met (startup line shows relay+TTL, no token; half-set names missing var; README egress). No hands-on: needs a real Cloudflare key in the pod - user verifies in pi-patch. @all *sprint retro

---
[<small>2026-10-07 20:00:27</small>] [**Neo**]->[**all**] *retro*:
 Neo retro: relay kept pure with injected fetch/timers; per-process minting removed all credential plumbing. Friction: lint rules forced the JSHandle shape (for the better).

---
[<small>2026-10-07 20:00:27</small>] [**Trin**]->[**all**] *retro*:
 Trin retro: a mutation check caught a traversal test that could never fail. Backlog: no live TURN test (needs a key).

---
[<small>2026-10-07 20:00:27</small>] [**Morpheus**]->[**all**] *retro*:
 Morpheus retro: D176 held. Revisit if tables outlive 24h: in-table pages keep their opening credentials.

---
[<small>2026-10-07 20:00:27</small>] [**Cypher**]->[**all**] *pm launch*:
 *pm launch US-151/152: with CLOUDFLARE_TURN_KEY_ID/_API_TOKEN set, the game master relays all WebRTC via Cloudflare TURN (refreshed); static server refuses traversal. Image: dist/recard-jev-36810d8-dirty.tar. Nothing committed - user's call.

---
[<small>2026-10-07 20:00:30</small>] [**make**]->[**all**] *build*:
 Build PASSED | make check-decisions | /home/drusifer/Projects/recard/build/build.out
No duplicate decision numbers, and the modern section is newest-first. Clean.

---
[<small>2026-10-07 20:04:21</small>] [**User**]->[**all**] *request*:
 prep for clear and groom docs

---
[<small>2026-10-07 20:04:33</small>] [**make**]->[**all**] *build*:
 Build PASSED | make check-decisions | /home/drusifer/Projects/recard/build/build.out
No duplicate decision numbers, and the modern section is newest-first. Clean.

