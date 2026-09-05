/**
 * Remembers the HOST's own last-used table setup (direct user request:
 * "make the game params sticky so it remembers the previous session -
 * just the last one"). Which preset, whether guests could add zones,
 * how many players it waited for, which deck choices were checked (for
 * a preset that offers any, e.g. RtG) and the name typed in - so
 * starting a new table doesn't mean re-entering the same choices every
 * time.
 *
 * Sticky by OVERWRITE, not history - only ever the MOST RECENT session's
 * settings are kept, same "last one wins" shape as `identity.js`'s own
 * `rememberSession`. Pure and DOM-free for the same reason every other
 * storage module here is (`identity.js`, `panelLayout.js`,
 * `persistence.js`) - directly testable without touching real
 * localStorage, and `main.js` is the only thing that ever reads a form
 * field or writes one back.
 */

export const HOST_SETTINGS_STORAGE = 'recard:last-host-settings';

/**
 * @param {{name: string, presetName: string, allowsPlayerZones: boolean,
 *          expectedPlayers: number, deckChoiceIds: string[]|null}} settings
 *   `deckChoiceIds` is `null` for a preset that offers no deck choices
 *   at all - distinct from `[]`, which would mean "a choice existed and
 *   the host picked none" (never actually reachable - `main.js` blocks
 *   table creation on an empty selection).
 */
export function rememberHostSettings(storage, settings) {
  try {
    storage.setItem(HOST_SETTINGS_STORAGE, JSON.stringify(settings));
  } catch {
    // Private mode / quota - remembering is a convenience, never required.
  }
}

/**
 * @returns {{name: string, presetName: string, allowsPlayerZones: boolean,
 *            expectedPlayers: number, deckChoiceIds: string[]|null}|null}
 */
export function recallHostSettings(storage) {
  try {
    const raw = storage.getItem(HOST_SETTINGS_STORAGE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Only trust a well-formed record: a half-written or hand-edited
    // blob should mean "no memory", never a form silently prefilled
    // with garbage. `presetName` is the one field everything else here
    // hangs off (which deck choices even apply), so it's the one
    // required field.
    if (!parsed || typeof parsed.presetName !== 'string') return null;
    return {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      presetName: parsed.presetName,
      allowsPlayerZones: parsed.allowsPlayerZones !== false,
      expectedPlayers: Number.isSafeInteger(parsed.expectedPlayers) ? parsed.expectedPlayers : 0,
      deckChoiceIds: Array.isArray(parsed.deckChoiceIds)
        ? parsed.deckChoiceIds.filter((id) => typeof id === 'string')
        : null,
    };
  } catch {
    return null;
  }
}
