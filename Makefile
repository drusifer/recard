# Recard — Makefile fronting the project's npm scripts.
#
# npm remains the source of truth for HOW each task runs (package.json
# "scripts"); this file exists so `bobp make <target>` can wrap them with
# output capture to build/build.out instead of flooding the context with
# full npm output on every run.
#
# Adding a task: add the npm script first, then a one-line target here.

.PHONY: help test test-ui test-rtg test-hostsetup test-newgame test-tablezoom test-focuszoom test-multiplayer test-harness-mcp test-gin test-jev-runner jev-player jev-library jev-library-doc secrets hooks lint lint-js lint-style lint-design lint-decks lint-fix cards art art-gen check dev coverage-unit coverage-unit-deep test-audit connectome build-standalone dist check-decisions check-story-numbers

help:
	@echo "Recard targets (all front npm scripts):"
	@echo "  test          node --test tests/*.test.js"
	@echo "  test-ui       browser tests for card actions via the context menu"
	@echo "  test-rtg      RtG playthrough (draw/cast/tap/tokens/exile/discard/stack/restart)"
	@echo "  test-hostsetup  deck selection + sticky host settings on the start menu"
	@echo "  test-newgame  New Game: host swaps preset mid-table, same code"
	@echo "  test-tablezoom  Infinity Table: manual zoom dial + S/M/L/XL presets"
	@echo "  test-focuszoom  Infinity Table: focus-zoom grow-pile-in-place mechanism"
	@echo "  test-multiplayer  host + 2 guests driven over the real protocol (US-118 harness)"
	@echo "  test-harness-mcp  the harness MCP server over its real stdio transport (US-119)"
	@echo "  test-gin      a Gin bot joins a hosted table, draws and knocks out loud (US-120)"
	@echo "  jev-library   every name a turn file (games/<game>/turn.yaml) may use, with its meaning (US-129)"
	@echo "  jev-library-doc  regenerate docs/JEV_LIBRARY.md from the library"
	@echo "  test-jev-runner  the real jev-player CLI at a hosted table: moves, add-bot, quit (US-128)"
	@echo "  jev-player    GAME=gin|rtg STRATEGY=<player file name> CODE=<table code> [FIRST=bot|opponent] [HANDS=1] [DECK=<pile id>] [STEPS=12]: a Jev player joins your table (US-120, US-128)"
	@echo "  secrets      gitleaks: every commit + uncommitted changes to tracked files"
	@echo "  hooks        install the gitleaks pre-commit hook (.githooks/)"
	@echo "  lint         style + design + js"
	@echo "  lint-js      eslint"
	@echo "  lint-style   stylelint"
	@echo "  lint-design  design-lint (overlap + 44px touch targets)"
	@echo "  lint-decks   RtG deck balance (size/copies/lands/curve/colour)"
	@echo "  lint-fix     autofix style + js"
	@echo "  cards        compile content/rtg YAML -> src/decks/rtg/cards.json"
	@echo "  art-gen      paint card art via the codex CLI (~50 min, resumable)"
	@echo "  art          pack generated art into assets/cards/rtg/*.webp"
	@echo "  check        cards + test + lint + lint-decks + secrets  (full gate)"
	@echo "  dev          dev server"
	@echo "  build-standalone  bundle everything into dist/recard-standalone.html (runs via file://)"
	@echo "  dist         gather index.html/style.css/src/assets into dist/ for a static host upload"
	@echo "  check-decisions  verify docs/DECISIONS.md's modern section is newest-first, no duplicate D-numbers"
	@echo "  check-story-numbers  verify docs/USER_STORIES.md has no duplicate US-numbers"

test:
	npm test

test-ui:
	npm run test:ui

test-rtg:
	npm run test:rtg

test-hostsetup:
	npm run test:hostsetup

test-newgame:
	npm run test:newgame

test-tablezoom:
	npm run test:tablezoom

test-focuszoom:
	npm run test:focuszoom

test-multiplayer:
	npm run test:multiplayer

test-spectator:
	npm run test:spectator

test-addbot:
	npm run test:addbot

test-thoughts:
	npm run test:thoughts

test-motion:
	npm run test:motion

test-harness-mcp:
	npm run test:harness-mcp

test-gin:
	npm run test:gin

# US-128: the real jev-player CLI at a hosted table (Gin always; RtG with TYPESAFE_API_KEY)
test-jev-runner:
	npm run test:jev-runner

# US-120: a Jev player joins the table CODE you are hosting, playing GAME
# (gin) with strategy STRATEGY. Jev strategies need TYPESAFE_API_KEY.
jev-player:
	npm run jev-player -- --game '$(GAME)' --strategy '$(STRATEGY)' --code '$(CODE)' --first '$(or $(FIRST),bot)' --hands '$(or $(HANDS),1)' $(if $(DECK),--deck '$(DECK)') $(if $(STEPS),--steps '$(STEPS)')

# US-129 Gate 1 C2: every name a turn file may use, and what it means
jev-library:
	node tools/jevLibrary.mjs

jev-library-doc:
	node tools/jevLibrary.mjs --write

# Secret scan (direct user request, 2026-09-19 - the Jev players read
# TYPESAFE_API_KEY from the environment, and it must never land in a
# commit). Scans all history, then the uncommitted changes to tracked files.
secrets:
	@command -v gitleaks >/dev/null || { echo "gitleaks is not installed - see https://github.com/gitleaks/gitleaks#installing"; exit 1; }
	gitleaks git --no-banner --redact .
	gitleaks git --no-banner --redact --pre-commit .

# Versioned git hooks: points this clone at .githooks/ (the gitleaks
# pre-commit hook). Run once per clone.
hooks:
	git config core.hooksPath .githooks

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
# (2 lint:design "forced page scroll" findings at the 1440/1024
# breakpoints, pre-existing and backlogged - docs/BACKLOG.md), so `lint`
# always exits non-zero and folding it in here would make `check`
# permanently red and therefore meaningless. Run `make lint` separately
# and COMPARE to that baseline rather than expecting exit 0.
#
# *fix (2026-09-17, D132 revision): the 3 lint:design zone-overlap
# findings this comment used to cite (grown to 5 by the time it was
# fixed) are GONE - `#zones` fixed local canvas + computed fit-zoom
# (`tableZoom.js`'s `TABLE_CANVAS_SIZE`/`computeFitZoom`) plus
# repositioning `presets.js`' `SIMPLE_LAYOUT` table-zone/score panels
# to clear the top seat's own zone. The 7 sonarjs/cognitive-complexity
# findings this comment also used to cite were independently resolved
# to 0 at some earlier point without this comment being updated -
# see docs/BACKLOG.md's "Not carried forward" section for both.
#
# *fix (2026-09-18, D134): `lint:design` now sweeps EVERY preset's own
# layout, not just whichever one the host form defaults to (found real,
# previously-invisible bugs this way: Gin Rummy's dead DevTools capture,
# Chips & Tokens missing a `layout` entirely, several `.pile-section`
# `min-width: 11rem` floor mismatches). Two presets carry a KNOWN,
# accepted zone-overlap exception, still logged by the sweep but not
# counted toward its exit code - Recard the Gathering (Smith's Gate-1
# C3, its own crowded 15-deck table) and Solitaire (a solo-designed
# preset a second player can still join). See `tests/designLint.check.
# mjs`'s `KNOWN_EXCEPTIONS` and each preset's own comment in
# `presets.js`.
#
# `lint-decks` IS included: it carries no baseline debt, so it can and
# must stay at exit 0 - an unbalanced deck is a real failure, not a
# tolerated one.
check: cards test lint lint-decks secrets

dev:
	npm run dev

build-standalone:
	npm run build:standalone

dist:
	npm run build:dist

coverage-unit:
	npm run coverage:unit

coverage-unit-deep: coverage-unit
	npm run coverage:unit:deep

# Python, not npm - deviates from this file's own "add the npm script
# first" rule on purpose: pandas/matplotlib have no natural home in
# package.json, and routing them through an npm script would just be an
# extra layer of indirection with nothing on the other side. Bootstraps
# .venv on first run (already gitignored, same as node_modules) so this
# works from a clean checkout with no separate setup step.
test-audit:
	test -d .venv || python3 -m venv .venv
	.venv/bin/pip install -q -r tools/testAudit/requirements.txt
	.venv/bin/python3 tools/testAudit/analyze.py

connectome:
	node tools/codeConnectome/buildGraph.mjs
	node tools/codeConnectome/render.mjs

# Oracle grooming aid: docs/DECISIONS.md's modern section (D82+)
# must be newest-first with unique decision numbers - see the
# 2026-09-10 groom that found D116 assigned twice and D111/D112
# swapped by hand. Run after adding any new decision entry.
check-decisions:
	node tools/checkDecisionOrder.mjs

# Same purpose as check-decisions but for docs/USER_STORIES.md - see
# the 2026-09-10/11 groom that caught US-117 first drafted as US-110,
# a number already in use. No newest-first ordering to check here
# (stories are forward-chronological with expected gaps), just
# duplicates.
check-story-numbers:
	node tools/checkStoryNumbers.mjs
