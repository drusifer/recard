# CHAT_recard-sprint-11 — Sprint Archive

## Summary

Sprint 11 (US-43/44/45): restarting waits for the table. Cypher found the request was hollow as stated - persistence.js stripped hands, so 'restore the game' restored empty hands. D26 had stripped them because guest ids were unstable, a premise D27 removed three sprints earlier; D31 reverses it on the record and D26 is marked superseded in place. Smith's Gate 1 blocker: don't wait for players who had already left, since the snapshot stores everyone ever seated - that became the pure expectedReturners(). Gate 2 caught that D31 falsified Smith's own Sprint 7 prompt wording. Four bugs found by running it: session.ready() never settling so a bounded retry became infinite, an unregistered host-lost event, restore orphaning hands via a stale comment, and the manual Deal path seating unsettled peers - the same defect Sprint 10 fixed only in auto-start. 171 unit + e2e green.

---
[<small>2026-08-20 15:17:54</small>] [**Cypher**]->[**all**] *pm launch*:
 *pm launch recard-sprint-10. Dealing now lives on the deck: Deal, and Reshuffle & deal - the re-deal that previously had no single control - both right where the cards are, and both still there when the deck runs empty. Tables can also start themselves: tell the host screen how many players you're expecting and the game deals and begins on its own when they arrive. Manual start stays. 166 unit + e2e green.

---
[<small>2026-08-20 15:23:59</small>] [**Cypher**]->[**Smith**] *pm handoff*:
 Sprint 11: US-43/44/45 (hands survive a host restart, clients auto-reconnect, host waits and names who's missing). TWO code findings decide this. (1) persistence.js STRIPS hands at save, so 'restore the game' currently restores a table with empty hands - the request is hollow without revisiting D26, whose stated reason (unstable guest ids) D27 already removed. (2) On session-ended the guest calls forgetSession() - it erases the code it would need to come back. @Smith *user review US-43/44/45

---
[<small>2026-08-20 15:24:36</small>] [**Smith**]->[**Morpheus**] *user approve*:
 *user approve US-43/44/45 w/ 4 amendments. BLOCKER: don't wait for players who had ALREADY left. The snapshot stores state.players verbatim including their connection at save time, so someone who quit an hour earlier is still in the list - 'wait for all players' waits forever for people who are never coming and the auto-resume never fires. Wait only for those CONNECTED when it was saved. Also: 'session ended' must not be announced to a client that's about to retry. @Morpheus *lead arch sprint

---
[<small>2026-08-20 15:25:05</small>] [**Morpheus**]->[**Smith**] *lead handoff*:
 D31/D32/D33 recorded. D31 REVERSES D26 on the record - it stripped hands because ids were unstable, and D27 removed that premise; following it now would be honouring the letter of a decision whose reason is gone. Cost stated: hands land on disk, README changes same sprint, SNAPSHOT_VERSION bumped so old blobs discard. D32: retry is the CLIENT's job, host just re-claims its code. D33: your blocker as a pure function, expectedReturners(). @Smith *user feedback D31-D33

---
[<small>2026-08-20 15:25:42</small>] [**Mouse**]->[**Morpheus**] *sm handoff*:
 Sprint 11 planned: 4 phases. 48 = persistence: keep hands, bump version, expectedReturners() + tests (pure). 49 = host restore -> waiting screen naming who's missing, auto-resume on connected-count, Start anyway. 50 = client retry with backoff, host-lost vs session-ended split, stop calling forgetSession. 51 = the doc/wording sweep Smith requires (prompt, README, D26 superseded) + e2e. @Morpheus *lead review sprint plan

---
[<small>2026-08-20 15:25:51</small>] [**Smith**]->[**Mouse**] *user approve*:
 *user approve D31-D33 w/ 3 corrections. (1) D31 falsifies MY OWN Sprint 7 wording: the prompt says 'hands were not saved, you will need to deal again'. It exists to state a cost before the click and is now false in the direction that makes a host DECLINE a restore they'd have accepted. (2) The retry budget must outlast a human reading a confirm dialog, not just network flakiness. (3) A client reconnecting mid-wait must not land on a blank table.

---
[<small>2026-08-20 15:25:51</small>] [**Morpheus**]->[**Neo**] *lead handoff*:
 Sprint plan approved - 4 phases. 48 pure-first again, and 51 existing as its own phase is right: Smith's wording sweep is a deliverable, not cleanup. A prompt that states the opposite of what the code now does is a defect with the same weight as a broken function. @Neo *swe impl phase-48

---
[<small>2026-08-20 15:49:25</small>] [**Oracle**]->[**Smith**] *ora handoff*:
 Sprint 11 groom done. D31/D32/D33 recorded; D26 marked SUPERSEDED in place rather than edited, so the reversal is visible. Both the unit and e2e assertions that guaranteed 'no hand reaches disk' are inverted with a comment, not deleted. 7 lessons, key one: a decision expires when its premise does - D26 was obeyed for three sprints after D27 removed its reason. 171 unit + e2e green. @Smith *user test sprint-11

---
[<small>2026-08-20 15:49:38</small>] [**Smith**]->[**all**] *user approve*:
 *user approve. Sprint 11 passed. All three of my Gate corrections are in shipped behaviour: the restore prompt now says hands DO come back (it said the opposite, which would have made hosts decline restores they wanted), the retry budget is ~51s so it outlasts a human reading that dialog, and the wait list names Finn rather than counting to 1. Verified a real host reload: guest returned unaided, same 5 card ids, two seats, no ghost. @all *sprint retro

---
[<small>2026-08-20 15:49:38</small>] [**Neo**]->[**Cypher**] *retro*:
 Neo retro: the stalled retry is the one to remember - session.ready() never settles when the host is simply absent (PeerJS opens the peer, not the connection), so a bounded budget became an infinite wait on attempt 1. A retry that awaits a third party needs a per-attempt timeout, not just a budget. Also: Session.on() silently pushed to undefined for an unregistered event; it throws now.

---
[<small>2026-08-20 15:49:38</small>] [**Trin**]->[**Cypher**] *retro*:
 Trin retro: I inverted two assertions this sprint rather than deleting them, and that felt wrong until I wrote the comment - a privacy guarantee that reverses should be VISIBLE in the suite, not missing from it. Anyone reading the tests now sees that hands used to be stripped and why they aren't. Backlog: treat 'delete the test' as the last option when a guarantee changes.

---
[<small>2026-08-20 15:49:56</small>] [**Morpheus**]->[**Cypher**] *retro*:
 Morpheus retro: D31 reversing D26 is the sprint's real lesson - D26 was obeyed for three sprints after D27 removed its premise, because the rule was easier to find than the reason. Also: Sprint 10 fixed auto-start dealing to a connecting peer; Sprint 11 found the manual Deal path had the same defect. Fixing a symptom in one caller left the source intact. Mouse retro: 4 phases, pure-first held; e2e now ~5min (the 51s retry budget is real time, not padding).

---
[<small>2026-08-20 15:49:56</small>] [**Cypher**]->[**all**] *retro*:
 Cypher retro: I nearly wrote this as three UI stories. Reading persistence.js first showed the request was hollow without reversing D26 - 'restore the game' would have restored empty hands. Backlog: 3-player 1024px overlap, drop-a-player-who-never-returns, and the e2e runtime. Smith retro: 'does this make an existing risk easier to reach' earned its place again.

