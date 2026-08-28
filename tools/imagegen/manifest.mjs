/**
 * imagegen — manifest parsing (pure, I/O-free).
 *
 * A manifest is the list of images to generate: an `id` (which becomes
 * the output filename) and a `prompt` (what to paint). Two formats,
 * because both are natural depending on where the list comes from:
 *
 *   jobs.tsv   `<id>\t<prompt>` per line, easy to emit from anything
 *   jobs.json  `[{id, prompt}, ...]`, easy to emit from a build step
 */

/** An id becomes `<outDir>/<id>.png`, so it must not be able to escape
 * the output directory or collide with a path separator. */
const SAFE_ID = /^[\w.-]+$/;

/**
 * @param {string} text raw manifest contents
 * @param {string} filename used to pick the format and to name errors
 * @returns {{id: string, prompt: string}[]}
 */
export function parseManifest(text, filename) {
  const items = filename.endsWith('.json') ? parseJson(text) : parseTsv(text);

  const seen = new Set();
  for (const { id } of items) {
    if (!SAFE_ID.test(id)) {
      throw new Error(`${filename}: unsafe id "${id}" — ids become filenames, so they may only contain letters, digits, dot, dash and underscore`);
    }
    if (seen.has(id)) throw new Error(`${filename}: duplicate id "${id}" — the second would overwrite the first`);
    seen.add(id);
  }
  return items;
}

function parseTsv(text) {
  const items = [];
  const lines = text.split('\n');
  for (const [index, raw] of lines.entries()) {
    const line = raw.trimEnd();
    if (line === '' || line.startsWith('#')) continue;
    // Split on the FIRST tab only: a prompt may legitimately contain
    // tabs, and splitting on all of them would silently truncate it.
    const tab = line.indexOf('\t');
    if (tab === -1) {
      const shape = String.raw`<id>\t<prompt>`;
      throw new Error(`line ${index + 1}: expected ${shape}, got "${line.slice(0, 40)}"`);
    }
    items.push({ id: line.slice(0, tab).trim(), prompt: line.slice(tab + 1).trim() });
  }
  return items;
}

function parseJson(text) {
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new TypeError('expected a top-level array of {id, prompt}');
  for (const [index, item] of parsed.entries()) {
    if (!item?.id) throw new Error(`entry ${index}: missing "id"`);
    if (!item?.prompt) throw new Error(`entry ${index}: missing "prompt"`);
  }
  return parsed.map(({ id, prompt }) => ({ id: String(id), prompt: String(prompt) }));
}
