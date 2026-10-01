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
separately by inspection + a live offline-fallback check (no TYPESAFE_API_KEY
configured in this environment to exercise the real judging path against -
a disclosed, not silently skipped, gap).
"""
import sys
import unittest
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
    """The offline path - what actually runs with no TYPESAFE_API_KEY. The
    real Jev-judged path (trace_judge.mjs's success case) is NOT covered
    here: no API key is configured in this environment to call it with,
    and faking that response would just prove the mock agrees with itself
    (trin skill's own warning about this exact failure mode). Disclosed,
    not silently skipped - see this module's own docstring.
    """
    def test_no_jev_flags_every_candidate(self):
        candidates = [{'id': 0, 'rule': 'AP-MAKE-BYPASS', 'state': {'command': 'pytest'}}]
        self.assertEqual(judge_candidates(candidates, use_jev=False, cwd=Path('.')), {0: 'yes'})

    def test_empty_candidates_short_circuits(self):
        self.assertEqual(judge_candidates([], use_jev=True, cwd=Path('.')), {})

    def test_unreachable_jev_falls_back_to_yes(self):
        # No TYPESAFE_API_KEY in this environment -> the bridge exits 1 ->
        # judge_candidates must fall back rather than raise or drop flags.
        candidates = [{'id': 0, 'rule': 'AP-MAKE-BYPASS', 'state': {'command': 'pytest'}}]
        verdicts = judge_candidates(candidates, use_jev=True, cwd=Path(__file__).parent.parent.parent)
        self.assertEqual(verdicts, {0: 'yes'})


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
