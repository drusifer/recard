#!/usr/bin/env python3
"""
Regression tests for trace_annotate.py - stdlib unittest, no new dependency
(this project has no Python test runner of its own; `agents/tools/` is the
generic, project-agnostic half of bob-protocol, invoked directly rather than
through recard's own `bobp make` targets, same as trace_annotate.py itself).

Run:
    python3 agents/tools/test_trace_annotate.py

Found during UAT (Trin), not asked for up front: every check made while
BUILDING this feature (Neo's own self-validation included) was a one-off
`python3 -c` probe in Bash - exactly the AP-ONEOFF-SCRIPT shape this tool
exists to catch. This file is that work, made real and repeatable instead.
All tests run with `use_jev=False` - deterministic, no network, no API key
needed; the Jev-judging half itself (`trace_judge.mjs`) is verified
separately by inspection, a live offline-fallback check, AND (once a real
TYPESAFE_API_KEY turned out to already be configured - see `agents/neo.docs/
state.md`) a live run of the real judging path, discriminating `pytest tests/`
(yes) from `pytest --help` (no) from an ambiguous repeat (unsure).

`ClassifyBashTests.test_quoted_free_text_is_not_a_command` and
`AnnotateEventsTests.test_oneoff_ignores_name_mentioned_in_unrelated_commit_
message` are both real bugs found by running this tool for real against a
real session (`*judge general`, 2026-10-01): a `git commit -m "$(cat <<'EOF'
...)"` heredoc and a `bobp chat "...python3 -c..."` call were both flagged as
one-off scripts because their own MESSAGE TEXT happened to contain a phrase
the heuristics were matching - not because either command actually ran
anything. See `agents/smith.docs/bugs_trace_annotate.md` for the full writeup.
"""
import os
import sys
import unittest
import unittest.mock
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from trace_annotate import (  # noqa: E402 - path setup must precede this
    BUILTIN_RULES, FULL_SUITE_RE, annotate_events, classify_bash,
    is_oneoff_script_candidate, judge_candidates,
)


class ClassifyBashTests(unittest.TestCase):
    def test_make_bypass(self):
        self.assertIn('AP-MAKE-BYPASS', classify_bash('pytest tests/'))
        self.assertNotIn('AP-MAKE-BYPASS', classify_bash('make test'))

    def test_raw_venv(self):
        self.assertIn('AP-RAW-VENV', classify_bash('.venv/bin/pytest'))

    def test_make_pipe_excludes_help(self):
        self.assertIn('AP-MAKE-PIPE', classify_bash('make test 2>&1 | tail -30'))
        self.assertNotIn('AP-MAKE-PIPE', classify_bash('make help | less'))

    def test_via_grep_symbol_vs_text(self):
        self.assertIn('AP-VIA-GREP', classify_bash('grep -rn "def foo" src/'))
        self.assertNotIn('AP-VIA-GREP', classify_bash('grep -rn "TODO" src/'))

    def test_oneoff_inline_eval(self):
        self.assertIn('AP-ONEOFF-SCRIPT', classify_bash('node -e "console.log(1)"'))
        self.assertIn('AP-ONEOFF-SCRIPT', classify_bash('python3 -c "print(1)"'))
        self.assertNotIn('AP-ONEOFF-SCRIPT', classify_bash('node --test tests/foo.test.js'))

    def test_quoted_free_text_is_not_a_command(self):
        """Real bug, found live (`*judge general`): a chat/commit MESSAGE that
        merely discusses "python3 -c" or pipes make output in prose is not
        this Bash call actually doing either."""
        chat = 'bobp chat "found one-off python3 -c probes everywhere" --persona Trin --cmd note'
        self.assertNotIn('AP-ONEOFF-SCRIPT', classify_bash(chat))
        commit = "git commit -q -m \"$(cat <<'EOF'\npipe make output into tail sometime\nEOF\n)\""
        self.assertNotIn('AP-MAKE-PIPE', classify_bash(commit))
        # Still works for a REAL invocation sitting right next to quoted text.
        mixed = 'python3 -c "print(1)" # not quoted, this part really runs'
        self.assertIn('AP-ONEOFF-SCRIPT', classify_bash(mixed))


class IsOneoffScriptCandidateTests(unittest.TestCase):
    def test_excludes_tests_and_tools_and_scratch(self):
        self.assertFalse(is_oneoff_script_candidate('tests/helpers/fake.mjs'))
        self.assertFalse(is_oneoff_script_candidate('agents/tools/trace_annotate.py'))
        self.assertFalse(is_oneoff_script_candidate('/tmp/scratch/repro.mjs'))
        self.assertFalse(is_oneoff_script_candidate('/tmp/x/scratchpad/repro.mjs'))

    def test_flags_a_real_repo_tree_throwaway(self):
        self.assertTrue(is_oneoff_script_candidate('tools/scratch_repro.mjs'))

    def test_ignores_non_script_extensions(self):
        self.assertFalse(is_oneoff_script_candidate('docs/notes.md'))


class FullSuiteRegexTests(unittest.TestCase):
    def test_matches_full_runs(self):
        for cmd in ('make test', 'make check', 'npm test', 'pytest', 'node --test tests/*.test.js'):
            self.assertTrue(FULL_SUITE_RE.search(cmd), cmd)

    def test_excludes_targeted_runs(self):
        for cmd in ('make check-fast', 'make test-unit', 'pytest tests/test_foo.py',
                    'pytest -k something', 'node --test tests/warBot.test.js'):
            self.assertFalse(FULL_SUITE_RE.search(cmd), cmd)


class JudgeCandidatesFallbackTests(unittest.TestCase):
    """The offline path - what runs with no TYPESAFE_API_KEY (forced via
    `test_unreachable_jev_falls_back_to_yes`'s own env patch, regardless of
    whatever key this environment actually has configured). The real
    Jev-judged success path is covered separately by `RealJevJudgingTests`
    below, against the real binary - trin skill's own standing warning
    against trusting a mock to prove a wrapped CLI's real behavior.
    """
    def test_no_jev_flags_every_candidate(self):
        candidates = [{'id': 0, 'rule': 'AP-MAKE-BYPASS', 'state': {'command': 'pytest'}}]
        self.assertEqual(judge_candidates(candidates, use_jev=False, cwd=Path('.')), {0: 'yes'})

    def test_empty_candidates_short_circuits(self):
        self.assertEqual(judge_candidates([], use_jev=True, cwd=Path('.')), {})

    def test_unreachable_jev_falls_back_to_yes(self):
        # Force the bridge's own no-key failure DETERMINISTICALLY, not by
        # assuming this environment has none - real bug, found live: this
        # test originally just omitted TYPESAFE_API_KEY from its own call,
        # which happened to be unreachable the first time it was written,
        # but once a real key turned out to already be configured in the
        # ambient environment, this silently became a REAL network call
        # that happened to still pass (a bare "pytest" really is a `yes`) -
        # a test proving nothing, passing for the wrong reason.
        with unittest.mock.patch.dict(os.environ, {'TYPESAFE_API_KEY': ''}):
            candidates = [{'id': 0, 'rule': 'AP-MAKE-BYPASS', 'state': {'command': 'pytest'}}]
            verdicts = judge_candidates(candidates, use_jev=True, cwd=Path(__file__).parent.parent.parent)
        self.assertEqual(verdicts, {0: 'yes'})


@unittest.skipUnless(os.environ.get('TYPESAFE_API_KEY'), 'needs a real TYPESAFE_API_KEY - skipped, not faked')
class RealJevJudgingTests(unittest.TestCase):
    """The real `judge.systemOne` call, against the real TypeSafe binary -
    trin skill's own standing rule: a mocked response only proves the code
    agrees with what its author ASSUMED the judgment would be, never
    whether that assumption is correct. Costs one real network round-trip
    each; skipped (not faked) wherever no key is configured, including CI
    unless one is provided.
    """
    def test_discriminates_real_bypass_from_a_harmless_help_check(self):
        candidates = [
            {'id': 0, 'rule': 'AP-MAKE-BYPASS', 'state': {'command': 'pytest tests/test_foo.py'}},
            {'id': 1, 'rule': 'AP-MAKE-BYPASS', 'state': {'command': 'pytest --help'}},
        ]
        verdicts = judge_candidates(candidates, use_jev=True, cwd=Path(__file__).parent.parent.parent)
        self.assertEqual(verdicts[0], 'yes', 'a real, narrowed test invocation really is bypassing make')
        self.assertEqual(verdicts[1], 'no', '--help is not really bypassing anything')

    def test_via_grep_only_counts_as_bypass_when_an_alternative_actually_existed(self):
        """Backlogged finding (2026-10-01, `*judge general`): a project
        whose own instructions say to use a dedicated navigation tool
        doesn't mean one was actually REACHABLE this session. Same obvious
        symbol-grep, two different `via_context` states - the real Jev
        call must weigh that context, not just the command text."""
        obvious_symbol_grep = 'grep -rn "class HarnessPeer" tests/'
        candidates = [
            {'id': 0, 'rule': 'AP-VIA-GREP', 'state': {
                'command': obvious_symbol_grep, 'via_mcp_used_elsewhere': True, 'via_cli_installed': True}},
            {'id': 1, 'rule': 'AP-VIA-GREP', 'state': {
                'command': obvious_symbol_grep, 'via_mcp_used_elsewhere': False, 'via_cli_installed': False}},
        ]
        verdicts = judge_candidates(candidates, use_jev=True, cwd=Path(__file__).parent.parent.parent)
        self.assertEqual(verdicts[0], 'yes', 'a real alternative existed and was ignored')
        self.assertEqual(verdicts[1], 'no', 'no alternative existed at all - nothing to bypass')


class AnnotateEventsTests(unittest.TestCase):
    """End to end, `use_jev=False` throughout - deterministic, no network."""

    def test_slow_test_repeat_needs_no_edit_between(self):
        events = [
            {'name': 'Bash', 'input': {'command': 'make test'}},    # first run: nothing to compare to
            {'name': 'Bash', 'input': {'command': 'make test'}},    # repeat, no edit since -> flagged
            {'name': 'Write', 'input': {'file_path': 'src/foo.js'}},
            {'name': 'Bash', 'input': {'command': 'make test'}},    # repeat, but edited since -> not flagged
        ]
        annotated = annotate_events(events, BUILTIN_RULES, no_via=False, use_jev=False)
        self.assertEqual(annotated[0]['flags'], [])
        self.assertIn('AP-SLOW-TEST-REPEAT', annotated[1]['flags'])
        self.assertNotIn('AP-SLOW-TEST-REPEAT', annotated[3]['flags'])

    def test_oneoff_write_then_run(self):
        events = [
            {'name': 'Write', 'input': {'file_path': 'tools/scratch_repro.mjs'}},
            {'name': 'Bash', 'input': {'command': 'node tools/scratch_repro.mjs'}},
        ]
        annotated = annotate_events(events, BUILTIN_RULES, no_via=False, use_jev=False)
        self.assertIn('AP-ONEOFF-SCRIPT', annotated[1]['flags'])

    def test_oneoff_write_then_run_excludes_scratchpad(self):
        events = [
            {'name': 'Write', 'input': {'file_path': '/tmp/x/scratchpad/repro.mjs'}},
            {'name': 'Bash', 'input': {'command': 'node /tmp/x/scratchpad/repro.mjs'}},
        ]
        annotated = annotate_events(events, BUILTIN_RULES, no_via=False, use_jev=False)
        self.assertNotIn('AP-ONEOFF-SCRIPT', annotated[1]['flags'])

    def test_oneoff_ignores_name_mentioned_in_unrelated_commit_message(self):
        """Real bug, found live: a LATER, unrelated commit message that
        merely mentions a written script's basename in passing must not be
        mistaken for running it - only an actual invocation should."""
        events = [
            {'name': 'Write', 'input': {'file_path': 'tools/scratch_repro.mjs'}},
            {'name': 'Bash', 'input': {'command': 'node tools/scratch_repro.mjs'}},  # the real run
            {'name': 'Bash', 'input': {'command': 'git commit -m "mentions scratch_repro.mjs in passing"'}},
        ]
        annotated = annotate_events(events, BUILTIN_RULES, no_via=False, use_jev=False)
        self.assertIn('AP-ONEOFF-SCRIPT', annotated[1]['flags'], 'the real run must still be caught')
        self.assertNotIn('AP-ONEOFF-SCRIPT', annotated[2]['flags'], 'a mere mention is not a run')

    def test_flags_are_deduped_per_event(self):
        """Real bug, found live: the same rule could be added as TWO
        independent candidates on one event (inline-eval regex AND the
        write-then-run match both firing) and both verdicts merged in,
        showing the rule twice on one row."""
        events = [
            {'name': 'Write', 'input': {'file_path': 'tools/repro.mjs'}},
            # Both the inline-eval shape AND a mention of the written basename, on one command.
            {'name': 'Bash', 'input': {'command': 'node -e "1" && node tools/repro.mjs'}},
        ]
        annotated = annotate_events(events, BUILTIN_RULES, no_via=False, use_jev=False)
        flags = annotated[1]['flags']
        self.assertEqual(flags.count('AP-ONEOFF-SCRIPT'), 1, flags)

    def test_skill_reload(self):
        events = [
            {'name': 'Skill', 'input': {'skill': 'make', 'args': 'setup'}},
            {'name': 'Skill', 'input': {'skill': 'make', 'args': 'test'}},
        ]
        annotated = annotate_events(events, BUILTIN_RULES, no_via=False, use_jev=False)
        self.assertEqual(annotated[0]['flags'], [])
        self.assertIn('AP-SKILL-RELOAD', annotated[1]['flags'])

    def test_dup_read_and_via_read(self):
        events = [{'name': 'Read', 'input': {'file_path': 'src/foo.py'}}] * 3
        annotated = annotate_events(events, BUILTIN_RULES, no_via=False, use_jev=False)
        self.assertIn('AP-VIA-READ', annotated[0]['flags'])
        self.assertIn('AP-DUP-READ', annotated[2]['flags'])
        self.assertNotIn('AP-DUP-READ', annotated[1]['flags'], 'only the 3rd read trips it')

    def test_via_candidates_carry_the_availability_context(self):
        """Shape check, no Jev needed: AP-VIA-GREP/AP-VIA-READ candidates
        must actually carry `via_mcp_used_elsewhere`/`via_cli_installed` in
        their state, or RULE_QUESTIONS' own instructions have nothing to
        read. Spies on `judge_candidates` rather than Jev itself."""
        events = [
            {'name': 'Bash', 'input': {'command': 'grep -n "class Foo" src/foo.js'}},
            {'name': 'Read', 'input': {'file_path': 'src/bar.py'}},
        ]
        import trace_annotate
        with unittest.mock.patch.object(trace_annotate, 'judge_candidates', wraps=trace_annotate.judge_candidates) as spy:
            annotate_events(events, BUILTIN_RULES, no_via=False, use_jev=False)
        candidates = spy.call_args[0][0]
        for candidate in candidates:
            self.assertIn('via_mcp_used_elsewhere', candidate['state'], candidate)
            self.assertIn('via_cli_installed', candidate['state'], candidate)

    def test_no_via_strips_via_flags_without_asking(self):
        events = [{'name': 'Read', 'input': {'file_path': 'src/foo.py'}}] * 3
        annotated = annotate_events(events, BUILTIN_RULES, no_via=True, use_jev=False)
        all_flags = [f for ev in annotated for f in ev['flags']]
        self.assertTrue(all('VIA' not in f for f in all_flags), all_flags)

    def test_edit_resets_dup_read_counting(self):
        events = [
            {'name': 'Read', 'input': {'file_path': 'src/foo.py'}},
            {'name': 'Read', 'input': {'file_path': 'src/foo.py'}},
            {'name': 'Edit', 'input': {'file_path': 'src/foo.py', 'old_string': 'a', 'new_string': 'b'}},
            {'name': 'Read', 'input': {'file_path': 'src/foo.py'}},
        ]
        annotated = annotate_events(events, BUILTIN_RULES, no_via=False, use_jev=False)
        self.assertNotIn('AP-DUP-READ', annotated[-1]['flags'], 'the edit in between starts a new generation')


if __name__ == '__main__':
    unittest.main()
