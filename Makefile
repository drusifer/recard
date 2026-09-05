# Recard — Makefile fronting the project's npm scripts.
#
# npm remains the source of truth for HOW each task runs (package.json
# "scripts"); this file exists so `bobp make <target>` can wrap them with
# output capture to build/build.out instead of flooding the context with
# full npm output on every run.
#
# Adding a task: add the npm script first, then a one-line target here.

.PHONY: help test test-ui test-rtg test-hostsetup lint lint-js lint-style lint-design lint-decks lint-fix cards art art-gen check dev

help:
	@echo "Recard targets (all front npm scripts):"
	@echo "  test          node --test tests/*.test.js"
	@echo "  test-ui       browser tests for card actions via the context menu"
	@echo "  test-rtg      RtG playthrough (draw/cast/tap/tokens/exile/discard/stack/restart)"
	@echo "  test-hostsetup  deck selection + sticky host settings on the start menu"
	@echo "  lint         style + design + js"
	@echo "  lint-js      eslint"
	@echo "  lint-style   stylelint"
	@echo "  lint-design  design-lint (overlap + 44px touch targets)"
	@echo "  lint-decks   RtG deck balance (size/copies/lands/curve/colour)"
	@echo "  lint-fix     autofix style + js"
	@echo "  cards        compile content/rtg YAML -> src/decks/rtg/cards.json"
	@echo "  art-gen      paint card art via the codex CLI (~50 min, resumable)"
	@echo "  art          pack generated art into assets/cards/rtg/*.webp"
	@echo "  check        cards + test + lint  (full gate)"
	@echo "  dev          dev server"

test:
	npm test

test-ui:
	npm run test:ui

test-rtg:
	npm run test:rtg

test-hostsetup:
	npm run test:hostsetup

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

# Two steps, because generating the art is expensive (~50 min for the
# full set, and quota-limited) while packing it is cheap and repeatable.
# Both run through the generic `imagegen` tool (tools/imagegen), which is
# not Recard-specific - it takes any manifest of id/prompt pairs.
#   make art-gen  paint every card via the `codex` CLI -> build/rtg-art-raw
#   make art      downscale those masters into assets/cards/rtg/*.webp
# The masters stay out of the repo; only the 512px WebP ships.
art-gen:
	npm run cards:jobs > /tmp/rtg-art-jobs.tsv
	node tools/imagegen/cli.mjs gen \
	  --manifest /tmp/rtg-art-jobs.tsv \
	  --out build/rtg-art-raw \
	  --backend codex --parallel 4 \
	  --style "high fantasy oil painting, Magic-the-Gathering card art, no text, no borders, no watermark"

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
