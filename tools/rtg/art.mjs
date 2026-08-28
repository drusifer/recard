/**
 * Recard the Gathering — procedural card art (US-79, D77).
 *
 * Pure and I/O-free (`genArt.mjs` is the shell that writes files), so
 * the interesting part — that the same card always produces the same
 * image — is directly testable.
 *
 * WHY PROCEDURAL, AND WHAT THE `art:` PROMPT IS FOR
 * Every card authors an `art:` string written as a real image-generation
 * prompt. This generator does NOT read it: it draws a deterministic
 * heraldic landscape from the card's own attributes instead. The prompt
 * is the interface to real generated illustration later — swap this
 * generator for an image pipeline and the pool needs no re-authoring.
 * Until then these give the set a coherent, legible look at card size,
 * which a placeholder box would not.
 *
 * The look: a layered ridge landscape under a colour-keyed sky with a
 * single celestial disc and a type emblem. It reads at 120px (the size a
 * card actually renders at on the table) and stays coherent across 132
 * cards because every element is derived, never random per-run.
 */

/** Per-colour palettes, keyed to the flavour each faction was written
 * with (see the pool files' header comments). */
const PALETTES = {
  W: { sky: ['#fdf6e3', '#f3d89b'], ridge: ['#c9a227', '#9a7b1e', '#6f5714'], disc: '#fffbe8', ink: '#5b4a12' },
  U: { sky: ['#dff3f7', '#7fb8cf'], ridge: ['#3d7f9c', '#2a5f79', '#1a3f54'], disc: '#eafaff', ink: '#12384a' },
  B: { sky: ['#cfd6cb', '#6b7566'], ridge: ['#44503f', '#2e372b', '#1a201a'], disc: '#c8ffd0', ink: '#131a13' },
  R: { sky: ['#ffe0c2', '#e07a3c'], ridge: ['#b64a22', '#8a3216', '#541c0c'], disc: '#fff2d8', ink: '#4d1a0a' },
  G: { sky: ['#e8f5d8', '#8fbf6a'], ridge: ['#4f8f43', '#37672f', '#20401d'], disc: '#f6ffe6', ink: '#1d3b18' },
  C: { sky: ['#eceff1', '#9aa4ab'], ridge: ['#6f7a80', '#4e575c', '#333a3e'], disc: '#ffffff', ink: '#2b3134' },
};

/** A small emblem per card type, drawn over the horizon. Type is the
 * fastest thing to read on a card at a glance, so it gets the shape. */
const TYPE_EMBLEM = {
  Creature: 'claw',
  Instant: 'bolt',
  Sorcery: 'spiral',
  Enchantment: 'ring',
  Artifact: 'gear',
  Land: 'none',
  Planeswalker: 'star',
};

/** FNV-1a: a tiny, stable string hash. Stable matters more than good
 * here - the same card id must give the same art on every machine and
 * every run, forever. */
function hashString(text) {
  let hash = 0x81_1C_9D_C5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.codePointAt(index);
    hash = Math.imul(hash, 0x01_00_01_93) >>> 0;
  }
  return hash >>> 0;
}

/** mulberry32 - a compact seeded PRNG, so "random" variation is
 * reproducible from the card id alone. */
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D_2B_79_F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Which palette a card draws from. A gold card blends its two colours
 * (sky from the first, ridges from the second) so a guild card is
 * visibly a guild card. A land uses the colours it produces, so a dual
 * land looks like the pair it serves.
 */
export function paletteFor(card) {
  const colors = card.colors?.length > 0 ? card.colors : landColorsFromText(card.text ?? '');
  if (colors.length === 0) return PALETTES.C;
  if (colors.length === 1) return PALETTES[colors[0]] ?? PALETTES.C;
  const first = PALETTES[colors[0]] ?? PALETTES.C;
  const second = PALETTES[colors[1]] ?? PALETTES.C;
  return { sky: first.sky, ridge: second.ridge, disc: first.disc, ink: second.ink };
}

/** Colours a land produces, read from its own rules text - same single
 * source of truth `deckSchema.mjs` uses for counting mana sources. */
function landColorsFromText(text) {
  const found = [];
  for (const color of ['W', 'U', 'B', 'R', 'G']) {
    if (text.includes(`{${color}}`)) found.push(color);
  }
  return found;
}

/** One ridge silhouette: a jagged polyline across the full width at a
 * given baseline, with peak height and roughness driven by the seed. */
function ridgePath(random, baseline, amplitude, width, height) {
  const steps = 7;
  const points = [`0,${height}`, `0,${baseline}`];
  for (let index = 1; index <= steps; index++) {
    const x = Math.round((width / steps) * index);
    const y = Math.round(baseline - random() * amplitude);
    points.push(`${x},${y}`);
  }
  points.push(`${width},${height}`);
  return points.join(' ');
}

function emblem(kind, cx, cy, ink) {
  const stroke = `stroke="${ink}" fill="none" stroke-width="2.5" stroke-linecap="round"`;
  switch (kind) {
    case 'claw': {
      return `<path d="M${cx - 9} ${cy + 8} Q${cx - 4} ${cy - 9} ${cx + 1} ${cy + 6} M${cx - 1} ${cy + 8} Q${cx + 4} ${cy - 11} ${cx + 9} ${cy + 5}" ${stroke}/>`;
    }
    case 'bolt': {
      return `<path d="M${cx + 4} ${cy - 10} L${cx - 5} ${cy + 1} L${cx + 1} ${cy + 1} L${cx - 4} ${cy + 10}" ${stroke}/>`;
    }
    case 'spiral': {
      return `<path d="M${cx} ${cy} m0,-2 a2,2 0 1,1 -2,2 a5,5 0 1,1 5,5 a8,8 0 1,1 -8,-8" ${stroke}/>`;
    }
    case 'ring': {
      return `<circle cx="${cx}" cy="${cy}" r="8" ${stroke}/>`;
    }
    case 'gear': {
      return `<circle cx="${cx}" cy="${cy}" r="6" ${stroke}/><path d="M${cx} ${cy - 11}v4M${cx} ${cy + 7}v4M${cx - 11} ${cy}h4M${cx + 7} ${cy}h4" ${stroke}/>`;
    }
    case 'star': {
      return `<path d="M${cx} ${cy - 10} L${cx + 3} ${cy - 3} L${cx + 10} ${cy - 2} L${cx + 4} ${cy + 3} L${cx + 6} ${cy + 10} L${cx} ${cy + 6} L${cx - 6} ${cy + 10} L${cx - 4} ${cy + 3} L${cx - 10} ${cy - 2} L${cx - 3} ${cy - 3} Z" fill="${ink}" opacity="0.85"/>`;
    }
    default: {
      return '';
    }
  }
}

/**
 * Build one card's art as a standalone SVG string.
 *
 * Deterministic: the same card always yields byte-identical output, so
 * regenerating the whole set produces no spurious diffs.
 *
 * @param {object} card a compiled card (needs `id`, `type`, `colors`, `text`)
 * @param {{width?: number, height?: number}} [size]
 * @returns {string} SVG markup
 */
export function cardArtSvg(card, { width = 200, height = 150 } = {}) {
  const palette = paletteFor(card);
  const random = seededRandom(hashString(card.id));
  const gradientId = `sky-${card.id.replaceAll(/[^\w-]/g, '')}`;

  const discX = Math.round(30 + random() * (width - 60));
  const discY = Math.round(height * 0.22 + random() * height * 0.12);
  const discR = Math.round(height * 0.09 + random() * height * 0.05);

  const ridges = palette.ridge
    .map((color, index) => {
      const baseline = height * (0.55 + index * 0.14);
      const amplitude = height * (0.22 - index * 0.05);
      return `<polygon points="${ridgePath(random, baseline, amplitude, width, height)}" fill="${color}"/>`;
    })
    .join('');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeXml(card.name ?? card.id)}">`,
    `<defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0%" stop-color="${palette.sky[0]}"/><stop offset="100%" stop-color="${palette.sky[1]}"/>`,
    '</linearGradient></defs>',
    `<rect width="${width}" height="${height}" fill="url(#${gradientId})"/>`,
    `<circle cx="${discX}" cy="${discY}" r="${discR}" fill="${palette.disc}" opacity="0.9"/>`,
    ridges,
    emblem(TYPE_EMBLEM[card.type] ?? 'none', Math.round(width / 2), Math.round(height * 0.78), palette.disc),
    '</svg>',
  ].join('');
}

function escapeXml(text) {
  return text
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}
