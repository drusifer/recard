# Tank State

## Context
- Secret scanning (2026-09-19, D140): `make secrets` runs gitleaks over history +
  `--pre-commit`, part of `make check`. `.githooks/pre-commit` fails closed without
  gitleaks; `make hooks` once per clone (done here). gitleaks 8.26.0 in ~/.local/bin.
- Jev package (D174): `make dist` also writes `dist/jev/`, a self-contained Node
  package (jev-table/jev-player/jev-game-master, incl. US-150 listening mode). Mirrors
  repo layout; files + deps from esbuild's import graph; deps now pinned to EXACT
  installed versions (was: repo ranges) so images get what was tested.
- pi-patch (../pi-patch, a k3s cluster: helm + ansible) is the deploy target, NOT a
  host called "patch". User: "ship it as part of ../pi-patch... make a deployable
  binary and we'll configure it up as a new workload". Convention copied from
  happening's `export-proxy-image`: app repo builds an image, `docker save`s a tar into
  dist/, pi-patch's playbook imports it on the nodes + helm upgrade. Tank does NOT
  write the pi-patch workload (user will).
- `docker` here is podman's emulation; native arm64 build on this Pi (darius).

## Current Task (2026-10-07) - Jev container image for pi-patch: DONE, uncommitted
- `make export-jev-image [VERSION=]` -> dist/recard-jev-<VERSION>.tar (built:
  recard-jev-36810d8-dirty.tar, ~1.0 GB). tools/jevPackage.Dockerfile ships inside
  dist/jev/. Recorded as a D174 amendment; posted to CHAT.
- Verified: `make test-jev-image` passed (run by the user); check-fast + secrets clean
  (1259 unit, lint). lint-design flaked once (its own raw 2s guest join, same flaky-join
  class as BACKLOG), clean on rerun.
- README memory figure (200-300MB per table/bot) is an ESTIMATE, not measured.

## Next Steps
- The user writes the pi-patch workload (helm chart + import playbook, like
  happening-proxy). Rebuild with a clean tag after commit (VERSION from git describe).
- Possible follow-up if asked: measure real per-table memory in a pod.
- Re-exported 2026-10-07 16:24 after a `make dist` wiped the tar (README-only change vs
  the image the user tested). `make dist` always empties dist/ - export last.
- Commit is the user's call.

---
*Last updated: 2026-10-07 14:30*
