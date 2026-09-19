// US-120: representative Gin states evaluated by every strategy - the
// "example typed evaluations" in docs/GIN_STRATEGY.md come from here
// (run them with `node tools/gin/examples.mjs`).
import { computeFacts } from './rules.mjs';
import { askJev, ginRequest } from './judgments.mjs';
import { STRATEGIES, decide } from './strategies.mjs';

const SUITS = { c: 'clubs', d: 'diamonds', h: 'hearts', s: 'spades' };
const card = (short) => ({ id: `${short.slice(0, -1)}-${SUITS[short.at(-1)]}-0`, rank: short.slice(0, -1), suit: SUITS[short.at(-1)] });
const cards = (text) => (text ? text.split(' ').map((short) => card(short)) : []);

function observation({ phase, hand, discardPile = '', stockDrawn, opponentDiscards = '', opponentTook = '', myDiscards = '' }) {
  return {
    handNumber: 1, phase, outcome: null, hand: cards(hand), discardPile: cards(discardPile),
    stockCount: 32 - stockDrawn, stockDrawn, opponentHandSize: 10,
    opponentDiscards: cards(opponentDiscards), opponentTook: cards(opponentTook), myDiscards: cards(myDiscards), takenFromDiscard: null,
  };
}

export const EXAMPLES = [
  {
    title: 'Midgame draw: the upcard completes a set',
    assumed: null,
    obs: observation({ phase: 'draw', hand: 'Ah 2h 3h 9c 9d Js Qs 5d 7c Kd', discardPile: 'Kc 9s', stockDrawn: 9, opponentDiscards: 'Kc 9s', myDiscards: 'Qd' }),
  },
  {
    title: 'Midgame discard: knockable at 5, but a gin chase keeps two outs',
    assumed: { threat: 1.2, helps: { '5h': 0.35, '4c': 0.2, '9d': 0.55, 'Jd': 0.3 } },
    obs: observation({ phase: 'discard', hand: '5h 7s 6s 4c 9s 9d 8s 10d 5s Ac Jd', discardPile: 'Kc Qh 8h', stockDrawn: 10, opponentDiscards: 'Kc Qh 8h', myDiscards: 'Kd Qs' }),
  },
  {
    title: 'Midgame discard, no knock: the opponent picked up the 8 of hearts',
    assumed: { threat: 1.8, helps: { 'Kd': 0.15, 'Js': 0.2, 'Qs': 0.25, '9c': 0.7 } },
    obs: observation({ phase: 'discard', hand: 'Ah 2h 3h 9c 9d Js Qs 5d 7c Kd 4c', discardPile: 'Kc 2s', stockDrawn: 11, opponentDiscards: 'Kc 2s', opponentTook: '8h 9h' }),
  },
  {
    title: 'Late game: knockable at 5 while the opponent looks one card from gin',
    assumed: { threat: 3.6, helps: { '7c': 0.6, '5d': 0.3, 'Ks': 0.1, 'Js': 0.2 } },
    obs: observation({ phase: 'discard', hand: 'Ah 2h 3h 9c 9d 9s Js Qs Ks 5d 7c', discardPile: 'Kc Qh 2d 3c', stockDrawn: 19, opponentDiscards: 'Kc Qh 2d 3c', opponentTook: '6h 7h' }),
  },
  {
    title: 'Last chance: two stock cards left, knockable at 9',
    assumed: { threat: 0.9, helps: { '9h': 0.3, '10d': 0.3, 'Qc': 0.2, '4d': 0.4 } },
    obs: observation({ phase: 'discard', hand: '6c 7c 8c 2s 2d 2h Jh Qh Kh 9h Qc', discardPile: 'Ad 5s', stockDrawn: 30, opponentDiscards: 'Ad 5s' }),
  },
];

const short = (id) => id.replace(/^(\w+)-(\w)\w*-0$/, (_, rank, suit) => `${rank}${{ c: '♣', d: '♦', h: '♥', s: '♠' }[suit]}`);

function assumedJudgments(example) {
  if (!example.assumed) return null;
  return {
    threat: example.assumed.threat,
    threatConfidence: null,
    helps: Object.fromEntries(Object.entries(example.assumed.helps).map(([key, value]) => [card(key).id, value])),
    model: 'assumed (no TYPESAFE_API_KEY)',
  };
}

const shortOrNull = (card) => (card ? short(card.id) : null);

function factsSummary(facts) {
  return {
    stage: facts.stage, deadwood: facts.deadwood, canKnock: facts.canKnock, isGin: facts.isGin,
    ginOuts: facts.ginOuts, unseen: facts.unseen, isLastChance: facts.isLastChance, layoffExposure: facts.layoffExposure,
    bestDiscard: shortOrNull(facts.bestDiscard?.card), upcard: shortOrNull(facts.upcard),
    upcardGain: facts.upcardGain, upcardMelds: facts.upcardMelds,
  };
}

function judgmentsSummary(jev, source) {
  if (!jev) return null;
  return { source, threat: jev.threat, helps: Object.fromEntries(Object.entries(jev.helps).map(([id, value]) => [short(id), value])) };
}

function decisionsFor(context) {
  const decisions = {};
  for (const strategy of Object.values(STRATEGIES)) {
    const { decision, trace } = decide(strategy, context);
    decisions[strategy.name] = { decision: decision.cardId ? { ...decision, card: short(decision.cardId) } : decision, decidedBy: trace.find((step) => step.fired).rule };
  }
  return decisions;
}

/**
 * @param {{ judge?: { systemOne: Function } }} [options]
 */
export async function evaluateExamples({ judge } = {}) {
  const results = [];
  for (const example of EXAMPLES) {
    const facts = computeFacts(example.obs);
    const jev = judge ? await askJev(judge, example.obs, facts) : assumedJudgments(example);
    const request = example.obs.phase === 'discard' ? ginRequest(example.obs, facts) : null;
    results.push({
      title: example.title,
      facts: factsSummary(facts),
      jevQuestions: request ? Object.keys(request.questions) : [],
      judgments: judgmentsSummary(jev, judge ? 'jev' : 'assumed'),
      decisions: decisionsFor({ obs: example.obs, facts, jev }),
    });
  }
  return results;
}
