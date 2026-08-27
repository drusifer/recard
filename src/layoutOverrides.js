/**
 * Named, reusable saved table layouts (US-69/70, D61) - a genuinely
 * different concept from `panelLayout.js`'s single "this browser's
 * current live arrangement" blob. `storage`-injected, same shape and
 * corrupt/hostile-storage tolerance as `panelLayout.js`.
 *
 * Store shape: `{ [name]: { presetName, layout, savedAt } }`. Save
 * (US-69) writes under the active preset's own `name`; SaveAs (US-70)
 * writes under a user-chosen name, still recording `presetName` so
 * `overridesForPreset` can list only the saves compatible with a given
 * preset selection - a fresh table's "Layout" picker never offers a
 * layout saved from an unrelated game.
 */
export const LAYOUT_OVERRIDES_KEY = 'recard:layout-overrides:v1';

/** Never let a corrupt or hostile storage break rendering - same
 * "absence/garbage means nothing saved yet" tolerance as
 * `panelLayout.js`'s `loadPanelLayout`. */
export function loadLayoutOverrides(storage) {
  try {
    const raw = storage.getItem(LAYOUT_OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function saveLayoutOverride(storage, name, presetName, layout, now = Date.now) {
  const all = loadLayoutOverrides(storage);
  all[name] = { presetName, layout, savedAt: now() };
  try {
    storage.setItem(LAYOUT_OVERRIDES_KEY, JSON.stringify(all));
  } catch {
    /*
    private mode / quota - not worth throwing, same call panelLayout.js already makes.
    */
  }
}

export function deleteLayoutOverride(storage, name) {
  const all = loadLayoutOverrides(storage);
  if (!Object.hasOwn(all, name)) return;
  delete all[name];
  try {
    storage.setItem(LAYOUT_OVERRIDES_KEY, JSON.stringify(all));
  } catch {
    /*
    same tolerance as saveLayoutOverride.
    */
  }
}

/** Every saved override whose recorded `presetName` matches - the
 * host UI's "Layout" picker at table-create time. */
export function overridesForPreset(storage, presetName) {
  const all = loadLayoutOverrides(storage);
  return Object.entries(all)
    .filter(([, entry]) => entry.presetName === presetName)
    .map(([name, entry]) => ({ name, ...entry }));
}

/**
 * D61: filters a live `panelLayout.js` blob down to the ids a FRESH
 * game of this preset can actually reproduce - the always-present
 * shared panels (`table-zone`/`score`/`deck`) plus whatever this
 * preset's own `GameConfig.piles`/`GameConfig.zones` declare (fixed,
 * preset-chosen ids, e.g. `foundation-1`). Anything else - a
 * player-created zone/pile's `crypto.randomUUID()` id, or a
 * per-player id like `player-<ownerId>`/`hand:<ownerId>` - is excluded
 * outright: none of those ids exist yet in a brand-new game, so saving
 * a position under them would be silently meaningless on replay.
 */
export function stableLayoutSubset(liveLayout, gameConfig = {}) {
  const stableIds = new Set([
    'table-zone',
    'score',
    'deck',
    ...(gameConfig.piles ?? []).map((p) => p.id),
    ...(gameConfig.zones ?? []).map((z) => z.id),
  ]);
  const subset = {};
  for (const [id, position] of Object.entries(liveLayout)) {
    if (stableIds.has(id)) subset[id] = position;
  }
  return subset;
}
