# Bugs found — `*judge general` (trace_annotate.py, 2026-10-01)

Found by Trin's manual review of the real Jev-judged trace run against today's
actual session (`agents/trin.docs/judge_tool_trace.md`), per the skill's own
"manual review is still required" rule. 1005 calls, 8 raw flag instances
(down from 118 mechanical candidates pre-Jev) - reviewed every one against the
real underlying command.

## Bug 1 (CONFIRMED): `AP-ONEOFF-SCRIPT`'s Write-then-run half matches inside unrelated free text

**Where**: `agents/tools/trace_annotate.py`, the `any(base in cmd for base in
oneoff_candidates)` check in `annotate_events`.

**Failure scenario**: event `[406]` in today's trace is a plain `git commit -m
"$(cat <<'EOF' ... EOF)"` heredoc - a completely ordinary multi-line commit
message, not a script execution of any kind. It was flagged `AP-ONEOFF-SCRIPT`
anyway (and Jev agreed - 'yes') because some earlier session's `.mjs`/`.py`
script basename happened to appear as a bare substring somewhere inside the
long commit-message text. The check is a naive `in` substring test with no
word boundary and no "this text is actually invoking a program" requirement -
it fires on a basename appearing ANYWHERE in a long string, including inside
quoted prose.

**Same root cause, second instance**: event `[362]`, a `bobp chat "...one-off
python3 -c probes..."` call (a chat message whose TEXT discusses the rule
itself), was flagged `AP-ONEOFF-SCRIPT` **twice** on the same event - once
because `ONEOFF_EVAL_RE` (`node -e`/`python -c`) matched the literal phrase
"python3 -c" appearing inside the quoted chat message (not an actual
invocation), and a second time via the same basename-substring bug as above.
The duplicate also exposes a smaller, separate defect: `annotate_events`
never deduplicates a rule appearing twice in one event's flag list.

**Fix direction**: both `ONEOFF_EVAL_RE` and the basename check need to stop
matching inside arbitrary quoted string arguments. A reasonable fix: only
scan the part of the command BEFORE any `-m`/`-c`/`"..."`-style quoted
message argument is a losing game (too many shapes); simpler and more
robust is word-boundary matching for the basename check (`\bBASENAME\b`
instead of substring `in`), plus skipping ONEOFF_EVAL_RE candidates
that are clearly inside a `bobp chat`/`git commit -m` quoted argument (those
two command prefixes are the two confirmed false-positive shapes). Also:
dedupe `flags` before writing it onto the annotated event.

## Bug 2 (DISCLOSED, not fixed - scope gap, not a defect): `AP-SLOW-TEST-REPEAT` only resets on the `Edit`/`Write` TOOL, not a Bash-level fix

**Where**: `any_edit_since_last_full_suite = True` only sets inside the
`elif name in ('Edit', 'Write')` branch.

**Observation**: events `[395]`→`[396]`→(`[397]` `npx eslint --fix ...`)→`[398]`
show `bobp make check` run three times; `[396]` and `[398]` both flagged
`AP-SLOW-TEST-REPEAT`. `[397]`'s `eslint --fix` is a REAL source mutation (if
it changed anything) that happens entirely inside a `Bash` call, invisible to
a tracker that only watches the `Edit`/`Write` tool types. Jev's own
instructions (`RULE_QUESTIONS['AP-SLOW-TEST-REPEAT']`) never even get told
whether a fix ran in between - the candidate `state` only carries
`{command, previous_command}`.

Whether `[398]`'s flag is actually WRONG depends on whether that particular
`eslint --fix` changed anything (not checked) - this is a precision
LIMITATION of the mechanical pre-filter's definition of "an edit happened",
not a clear-cut bug the way Bug 1 is. Logged for visibility; not blocking.

## Not a bug: `AP-VIA-GREP` (2 confirmed instances) and `AP-SLOW-TEST-REPEAT`'s other instance

Spot-checked against the real commands (`grep -n "class HarnessPeer" -A 80
tests/harness/multiplayer.mjs`, `bobp make check` back-to-back with zero
edit/write between) - both are real, correctly-judged instances of the
anti-pattern. Two similar-looking `grep -n "function ..." ` calls nearby
(`[198]`/`[199]`) were NOT flagged by Jev - judgment variance across similar
cases, not something to override by hand (re-deciding Jev's own call defeats
the point of this feature).
