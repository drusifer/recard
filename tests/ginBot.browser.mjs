// US-120: a Gin bot joins a table somebody else is hosting - through the
// real join screen, over the real PeerJS/WebRTC path - plays its turn, and
// knocks out loud on table talk (D138). The host here is a harness page;
// in real use it is a person's browser.
//
// NOT part of `npm test` - needs a browser and the PeerJS broker.
// `npm run test:gin` / `bobp make test-gin`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchChromium, startStaticServer, hostTable, joinTable, dealTable } from './harness/multiplayer.mjs';
import { GinBot } from '../tools/gin/bot.mjs';
import { knockEarly } from '../tools/gin/strategies.mjs';

const PORT = 8222; // not 8211-8221 (other browser test files / the MCP server)
const BOT_NAME = 'Bot (knock-early)';
// A-2-3 hearts, three 9s, J-Q-K spades + 5d: whatever it draws, it can knock.
const KNOCKABLE = ['A-hearts-0', '2-hearts-0', '3-hearts-0', '9-clubs-0', '9-diamonds-0', '9-spades-0', 'J-spades-0', 'Q-spades-0', 'K-spades-0', '5-diamonds-0'];

const fixture = { server: undefined, browser: undefined, closers: [] };

before(async () => {
  fixture.server = await startStaticServer(PORT);
  fixture.browser = await launchChromium();
});

after(async () => {
  await Promise.all(fixture.closers.map((close) => close()));
  await fixture.browser?.close();
  await fixture.server?.close();
});

/**
 * The host rearranges the bot's hand (Recard lets any player move any
 * card, D82-D85): everything else goes back to the deck, the knockable
 * ten come in from wherever the deal put them.
 */
async function arrangeHand(host, botId, wanted) {
  const botHand = `hand:${botId}`;
  const hand = (await host.view()).piles.find((pile) => pile.id === botHand).cards;
  const held = new Set(hand.map((card) => card.id));
  for (const card of hand) {
    if (!wanted.includes(card.id)) await host.act({ type: 'MOVE', pileableId: card.id, toPileId: 'deck' });
  }
  for (const id of wanted) {
    if (!held.has(id)) await host.act({ type: 'MOVE', pileableId: id, toPileId: botHand });
  }
}

test('a bot joins a hosted Gin table, draws, and knocks face down with a table-talk announcement', async () => {
  const hosted = await hostTable({ browser: fixture.browser, baseUrl: fixture.server.baseUrl, preset: 'Gin Rummy' });
  fixture.closers.push(hosted.close);
  const joined = await joinTable({ browser: fixture.browser, baseUrl: fixture.server.baseUrl, code: hosted.code, name: BOT_NAME });
  fixture.closers.push(joined.close);
  await dealTable(hosted.host, [joined.peer], { players: 2, cardsPerPlayer: 10 });

  const botId = await joined.peer.myId();
  await arrangeHand(hosted.host, botId, KNOCKABLE);
  await joined.peer.waitForView((view, ids) => ids.every((id) => view.myHand.some((card) => card.id === id)) && view.myHand.length === ids.length, KNOCKABLE);

  const bot = new GinBot({ peer: joined.peer, strategy: knockEarly() });
  const draw = await bot.step();
  assert.deepEqual(draw.decision, { type: 'draw', source: 'stock' }, 'nothing on the discard pile yet');
  const knock = await bot.step();
  assert.equal(knock.decision.declare, 'knock');

  // The host sees the knock card face down on top of the discard pile...
  const hostView = await hosted.host.waitForView((view, cardId) => {
    const top = view.piles.find((pile) => pile.id === 'table')?.cards.at(-1);
    return top?.id === cardId && top.faceUp === false;
  }, knock.decision.cardId);
  assert.equal(hostView.piles.find((pile) => pile.id === `hand:${botId}`).cards.length, 10);

  // ...and hears it: the line is the bot's, by its seat name. US-121:
  // every decision is narrated now, so the knock is the LAST line, not
  // the only one - the draw that set it up spoke first.
  const talk = await hosted.host.waitForTalk(1);
  const line = talk.at(-1);
  assert.equal(line.name, BOT_NAME);
  assert.match(line.text, /^Knock! /);
  assert.equal(line.data.declare, 'knock');
  assert.ok(line.data.deadwood <= 5);
  assert.equal(line.data.kind, 'bot-decision', 'the decision record rides the same line (D142)');
  const shown = await hosted.host.query(['table-talk .talk-line']);
  assert.match(shown['table-talk .talk-line'].at(-1).text, /^Bot \(knock-early\): Knock! /);

  const after = await bot.step();
  assert.equal(after.phase, 'hand-over');
});
