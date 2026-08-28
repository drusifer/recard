import test from 'node:test';
import assert from 'node:assert/strict';

import { cardArtSvg, paletteFor } from '../tools/rtg/art.mjs';

const creature = {
  id: 'rtg-w-001', name: 'Dawnbreak Recruit', type: 'Creature', colors: ['W'], text: '',
};
const dual = {
  id: 'rtg-dual-wu', name: 'Oathwatch Causeway', type: 'Land', colors: [],
  text: 'Oathwatch Causeway enters the battlefield tapped. {T}: Add {W} or {U}.',
};

test('cardArtSvg: is deterministic — same card, byte-identical output', () => {
  // The whole point: regenerating 132 cards must produce no spurious
  // diffs, or the committed assets churn on every build.
  assert.equal(cardArtSvg(creature), cardArtSvg(creature));
});

test('cardArtSvg: different cards produce different art', () => {
  const other = { ...creature, id: 'rtg-w-002' };
  assert.notEqual(cardArtSvg(creature), cardArtSvg(other));
});

test('cardArtSvg: emits a well-formed standalone svg', () => {
  const svg = cardArtSvg(creature);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /<\/svg>$/);
  assert.equal((svg.match(/<svg/g) ?? []).length, 1);
});

test('cardArtSvg: escapes a name with XML-significant characters', () => {
  const svg = cardArtSvg({ ...creature, name: 'Ash & <Oath>' });
  assert.match(svg, /aria-label="Ash &amp; &lt;Oath&gt;"/);
  assert.doesNotMatch(svg, /aria-label="[^"]*<Oath>/);
});

test('cardArtSvg: gradient id is unique per card, so two inlined svgs cannot collide', () => {
  // Inlining two cards on one page with the same gradient id would make
  // the second card render with the first card's sky.
  const a = cardArtSvg(creature);
  const b = cardArtSvg({ ...creature, id: 'rtg-u-001', colors: ['U'] });
  const idOf = (svg) => svg.match(/id="(sky-[^"]+)"/)[1];
  assert.notEqual(idOf(a), idOf(b));
});

test('paletteFor: a mono card uses its own colour', () => {
  assert.deepEqual(paletteFor(creature).sky, paletteFor({ ...creature, id: 'x' }).sky);
  assert.notDeepEqual(paletteFor(creature).sky, paletteFor({ ...creature, colors: ['U'] }).sky);
});

test('paletteFor: a gold card blends its two colours', () => {
  const gold = { ...creature, colors: ['W', 'U'] };
  const mono = { ...creature, colors: ['W'] };
  const blended = paletteFor(gold);
  assert.deepEqual(blended.sky, paletteFor(mono).sky, 'sky from the first colour');
  assert.deepEqual(blended.ridge, paletteFor({ ...creature, colors: ['U'] }).ridge, 'ridges from the second');
});

test('paletteFor: a land with no colours reads the colours it produces', () => {
  // A dual land is colourless as a card but must not render as grey.
  assert.notDeepEqual(paletteFor(dual).sky, paletteFor({ ...dual, text: '' }).sky);
});
