/**
 * imagegen — the backend registry (pure, I/O-free).
 *
 * Same registry-dispatch shape the rest of this codebase uses
 * (`PILE_TYPES`, `DECK_TYPES`, `CARD_FACES`): a new image generator is
 * one new entry, and nothing else changes.
 *
 * Each backend supplies:
 *   command(id, prompt, outPath, style) -> {command, args}
 *   isQuotaError(output) -> boolean
 *   writesToOutPath: boolean   — true when the tool writes exactly where
 *                                we asked. False means it writes into a
 *                                shared scratch dir and the runner has
 *                                to go find and claim the file, which
 *                                also makes parallel runs unsafe.
 */

/**
 * The instruction every backend inherits.
 *
 * The "not code" clause is not decoration: asked plainly for "an image",
 * a coding agent will sometimes write a Python script that *draws* one,
 * which looks nothing like generated art. That happened in a real run
 * (it left `painter.py` and a 38 KB hand-drawn PNG behind), so the
 * requirement is stated explicitly.
 *
 * @param {string} subject what to depict
 * @param {string} style shared style suffix, may be empty
 */
export function buildPrompt(subject, style) {
  const styleClause = style ? ` Style: ${style}.` : '';
  return 'Generate a PNG image using your image generation tool — actual painted raster artwork. '
    + 'Do not write code to draw it.'
    + ` Subject: ${subject}.${styleClause}`;
}

/** Shared across backends: the phrases that mean "you are out of
 * budget", which is terminal, versus an ordinary transient failure. */
const QUOTA_PATTERNS = /quota|usage limit|rate limit|429|too many requests|upgrade your (subscription|plan)/i;

export const BACKENDS = {
  /**
   * OpenAI Codex CLI. Preferred: it takes an absolute output path per
   * image, so concurrent runs cannot collide.
   */
  codex: {
    writesToOutPath: true,
    command(id, prompt, outPath, style) {
      return {
        command: 'codex',
        args: [
          'exec',
          `${buildPrompt(prompt, style)} Save it to ${outPath}`,
          '--dangerously-bypass-approvals-and-sandbox',
        ],
      };
    },
    isQuotaError: (output) => QUOTA_PATTERNS.test(output),
  },

  /**
   * Google Antigravity CLI. Works, but writes into one shared scratch
   * directory (`~/.gemini/antigravity-cli/scratch`) regardless of what
   * path you ask for, so the runner must claim the file afterwards —
   * and its individual quota is small (~27 images before a 4h lockout).
   */
  agy: {
    writesToOutPath: false,
    scratchDir: '.gemini/antigravity-cli/scratch',
    command(id, prompt, outPath, style) {
      return {
        command: 'agy',
        args: [
          '-p',
          `${buildPrompt(prompt, style)} Call the file ./${id}.png`,
          '--output-format=svg',
          '--dangerously-skip-permissions',
        ],
      };
    },
    isQuotaError: (output) => QUOTA_PATTERNS.test(output),
  },
};

/**
 * Resolve a backend by name. Throws rather than defaulting — silently
 * falling back would spend a whole run on the wrong generator.
 */
export function backendFor(name) {
  const backend = BACKENDS[name];
  if (!backend) {
    throw new Error(`Unknown backend "${name}" (have: ${Object.keys(BACKENDS).join(', ')})`);
  }
  return backend;
}
