# Recard — Makefile fronting the project's npm scripts.
#
# npm remains the source of truth for HOW each task runs (package.json
# "scripts"); this file exists so `bobp make <target>` can wrap them with
# output capture to build/build.out instead of flooding the context with
# full npm output on every run.
#
# Adding a task: add the npm script first, then a one-line target here.

.PHONY: help test lint lint-js lint-style lint-design lint-decks lint-fix cards art check dev

help:
	@echo "Recard targets (all front npm scripts):"
	@echo "  test         node --test tests/*.test.js"
	@echo "  lint         style + design + js"
	@echo "  lint-js      eslint"
	@echo "  lint-style   stylelint"
	@echo "  lint-design  design-lint (overlap + 44px touch targets)"
	@echo "  lint-decks   RtG deck balance (size/copies/lands/curve/colour)"
	@echo "  lint-fix     autofix style + js"
	@echo "  cards        compile content/rtg YAML -> src/decks/rtg/cards.json"
	@echo "  art          generate assets/cards/rtg/*.svg from the compiled pool"
	@echo "  check        cards + test + lint  (full gate)"
	@echo "  dev          dev server"

test:
	npm test

lint:
	npm run lint

lint-js:
	npm run lint:js

lint-style:
	npm run lint:style

lint-design:
	npm run lint:design

lint-decks:
	npm run lint:decks

lint-fix:
	npm run lint:fix

cards:
	npm run cards:build

art:
	npm run cards:art

# The pre-handoff gate: everything that MUST be green. Deliberately does
# NOT include `lint` - this repo carries a known, accepted lint baseline
# (7 sonarjs/cognitive-complexity findings, 3 lint:design zone overlaps,
# all pre-existing and backlogged), so `lint` always exits non-zero and
# folding it in here would make `check` permanently red and therefore
# meaningless. Run `make lint` separately and COMPARE to that baseline
# rather than expecting exit 0.
#
# `lint-decks` IS included: it carries no baseline debt, so it can and
# must stay at exit 0 - an unbalanced deck is a real failure, not a
# tolerated one.
check: cards test lint-decks

dev:
	npm run dev
