# Smith live session: two RtG Jev bots, spectating host (2026-09-23)

Setup: harness server (fresh, over MCP stdio - build/mcpBridge.mjs) hosted
"Recard the Gathering" as a SPECTATOR (new `game_start spectate`), table
33ADAE. Two real CLI bots: `rules` and `aggressive` (US-129 player files),
shared deck rtg-mono-white (only one deck is offered - see F9). Facilitator
setup: DEAL 7 each from the deck (creates the hands), SET_SCORE 20 each.
Played: 2 full rounds (4 turns); both bots quit cleanly on a table-talk quit.

## What worked
- US-129 turn file live: untap -> draw -> land -> pass main -> pass combat ->
  "I'm done - your turn." every turn (the review's turn bug is fixed).
- A handoff by judgment worked once: aggressive ended, rules started.
- Quit (D149 + C4): one "everyone out" -> both said the goodbye, stopped at a
  safe point, logged "left the table cleanly", exit 0.
- Other hands render as backs even to the host (D84 data / D97 screen).

## Findings (severity order)
F1 BLOCKER - no colored spell is ever castable. Basic lands carry
   `colors: []` (color only in rules text "{T}: Add {W}"); `manaAvailable`
   counts by `colors`, so W available = 0 and `{W}` never pays. Main phase
   after the land drop offers only `pass`. No creatures -> combat unreachable.
F2 BLOCKER - the first turn cannot start from talk. "rules, it is your
   turn" x2 -> Jev their_turn_is_over = 0.21 (replayed with real Jev on the
   exact state). The question asks if the OTHER player's turn ended; at a
   game start nobody has had one. A confident "no" is never escalated.
F3 HIGH - talk has no addressee. "aggressive: ... it is your turn now" made
   BOTH bots take a turn at once (rules took two in a row).
F4 HIGH - the bot's `opponent` is the spectating host (hand_size 0, life
   null): buildRtgState picks the first non-me player, spectators included.
   (User: RtG can have several opponents and allies - BACKLOG.)
F5 MEDIUM - with two bots, the first bot's "Is it my turn now?" resets the
   other's quiet timer; rules never got to ask.
F6 MEDIUM - bots ask "Is it my turn now?" right after ending their own turn,
   and during the other's turn; unanswered asks time out silently.
F7 MEDIUM (#1) - turn judgments are invisible: nothing logged, so a stuck
   bot and a thinking bot look the same. Diagnosis needed a replay script.
F8 MEDIUM (#3) - a spectator can FLIP a card face up but is refused turning
   it back ("not authorized to conceal"). I left the library top revealed.
F9 LOW - harness game_start offers ONE RtG deck (the host form's per-deck
   checkboxes are never ticked): a mirror match from a shared library.
F10 LOW (#2) - every RtG player greets "I play by the rules in my game
   file" (greeting is in turn.yaml, not the player file).
F11 LOW (#8) - duplicate option ids (play_land:Sunlit Expanse x5).
F12 LOW (#9) - MCP game_start silently ignored an unknown `spectate`
   param on the old server instead of refusing it.
F13 LOW (#8) - Add-a-Jev-bot and Table Talk panels overlap the left
   player's zone; the add-bot option text is truncated.
Unverified: two `make jev-player` bots on one machine likely collide on
   port 8230 (make does not forward URL) - I avoided it with --url.

## Follow-up (2026-09-23)
- F2 addressed by D155: a `pregame` phase judges `i_go_first` from talk and dice
  (`/roll`), asks "Do I go first?" when unsure. Not yet re-tested LIVE.
- F1 FIXED (D156): `describe()`/`manaAvailable` (playState.mjs) counted
  a land's mana by `colors` (its color IDENTITY - always [] for a land,
  since it has no cost) instead of `landColorSources(card)` (the colour(s)
  parsed from its own rules text, `deckSchema.mjs`, the same parser
  `lint:decks` already used to measure deck balance). Verified against the
  real catalog: all 25 shipped lands now parse to >=1 colour; the exact
  card that stalled the live session (Sunlit Expanse, `{T}: Add {W}.`)
  now produces W. Unit-tested + mutation-proved (tests/rtgPlayState.test.js);
  not yet re-tested LIVE with real bots.
