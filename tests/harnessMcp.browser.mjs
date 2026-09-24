// US-119: the harness MCP server, driven over its REAL stdio transport
// by the SDK's own client - the same way an agent's MCP host talks to
// it. Needs a browser and the PeerJS broker, so NOT part of `npm test`:
// `npm run test:harness-mcp` / `bobp make test-harness-mcp`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, URL } from 'node:url';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = '8221'; // not 8211-8219 (browser tests) or 8220 (the server's own default)

const fixture = { client: undefined, shots: undefined };

before(async () => {
  fixture.shots = await mkdtemp(path.join(tmpdir(), 'recard-shots-'));
  fixture.client = new Client({ name: 'harness-mcp-test', version: '0.0.0' });
  // Launched exactly as the committed .mcp.json registers it, from the
  // project root, with no CLAUDE_PROJECT_DIR - Claude Code does not set
  // that variable for MCP servers, so a config leaning on it never connects.
  const { mcpServers } = JSON.parse(await readFile(path.join(ROOT, '.mcp.json'), 'utf8'));
  const { command, args } = mcpServers['recard-harness'];
  const { CLAUDE_PROJECT_DIR: _unset, ...environment } = process.env;
  await fixture.client.connect(new StdioClientTransport({
    command,
    args,
    cwd: ROOT,
    env: { ...environment, RECARD_HARNESS_PORT: PORT, RECARD_SCREENSHOT_DIR: fixture.shots },
  }));
});

after(async () => {
  await fixture.client?.callTool({ name: 'game_stop', arguments: {} });
  await fixture.client?.close();
});

async function call(name, arguments_ = {}) {
  const result = await fixture.client.callTool({ name, arguments: arguments_ });
  return { result, data: result.isError ? undefined : JSON.parse(result.content[0].text) };
}

test('lists the harness tools', async () => {
  const { tools } = await fixture.client.listTools();
  const names = new Set(tools.map((tool) => tool.name));
  for (const name of ['game_start', 'game_status', 'game_stop', 'game_join', 'gin_turn', 'player_act', 'player_view', 'player_wait', 'player_query', 'player_traffic', 'player_say', 'player_talk', 'screenshot']) {
    assert.ok(names.has(name), `missing tool ${name}`);
  }
});

test('game_start stands up a named multi-player table', async () => {
  const { data } = await call('game_start', { players: 2, cardsPerPlayer: 3 });
  assert.deepEqual(data.players, ['host', 'guest1']);
  assert.match(data.code, /^[A-Z2-9]{6}$/);

  const { data: status } = await call('game_status');
  assert.deepEqual(status.players.map((player) => [player.name, player.handSize]), [['host', 3], ['guest1', 3]]);
});

test('game_status lists every pile by id with a card count - no probing piles.N.id', async () => {
  const { data: status } = await call('game_status');
  const { data: piles } = await call('player_view', { player: 'host', path: 'piles' });
  assert.deepEqual(status.piles, piles.map((pile) => ({ id: pile.id, name: pile.name, kind: pile.kind, cards: pile.cards.length })));
  assert.ok(status.piles.some((pile) => pile.id === 'deck' && pile.cards > 0));
});

test('a guest acts, the host converges, and both see it through their own tools', async () => {
  const { data: hand } = await call('player_view', { player: 'guest1', path: 'myHand' });
  assert.equal(hand.length, 3);
  const cardId = hand[0].id;

  await call('player_act', { player: 'guest1', action: { type: 'MOVE', pileableId: cardId, toPileId: 'table' } });
  for (const player of ['host', 'guest1']) {
    const { result } = await call('player_wait', {
      player,
      predicate: '(view, id) => view.piles.find((pile) => pile.id === "table").cards.some((card) => card.id === id)',
      arg: cardId,
    });
    assert.ok(!result.isError, result.content[0].text);
  }

  const selector = `[data-pile-id="table"] .middle-card[data-pileable-id="${cardId}"]`;
  const { data: seen } = await call('player_query', { player: 'guest1', selectors: [selector] });
  assert.equal(seen[selector].length, 1, 'the moved card is on the guest\'s screen, in the table pile');
});

test('player_traffic shows the real WebRTC messages: the guest\'s action out, the host\'s state in', async () => {
  const { data: sent } = await call('player_traffic', { player: 'guest1', type: 'action' });
  assert.ok(sent.some((entry) => entry.direction === 'out' && entry.message.action.type === 'MOVE'));
  const { data: received } = await call('player_traffic', { player: 'guest1', type: 'state', limit: 1 });
  assert.equal(received.length, 1);
  assert.equal(received[0].direction, 'in');
});

test('a bad call is a tool error, not a dead server', async () => {
  const { result } = await call('player_act', { player: 'guest9', action: { type: 'DRAW' } });
  assert.ok(result.isError);
  assert.match(result.content[0].text, /guest9/);
  const { data } = await call('game_status');
  assert.equal(data.players.length, 2, 'still serving the same table');
});

test('an action the reducer rejects reports its own message - no browser prefix or in-page stack', async () => {
  const { result } = await call('player_act', { player: 'host', action: { type: 'BOGUS' } });
  assert.ok(result.isError);
  assert.equal(result.content[0].text, 'Unknown action type: BOGUS');
});

test('a player_wait timeout says what it waited for and what the view holds now', async () => {
  const predicate = '(view) => view.myHand.length === 99';
  const { result } = await call('player_wait', { player: 'host', predicate, timeoutMs: 500, path: 'myHand.length' });
  assert.ok(result.isError);
  assert.equal(result.content[0].text, `Timed out after 500ms waiting for ${predicate} - myHand.length is now: 3`);
});

test('screenshot of one player comes back inline AND lands on disk with a contact sheet', async () => {
  const result = await fixture.client.callTool({ name: 'screenshot', arguments: { player: 'guest1', label: 'after move' } });
  assert.ok(!result.isError, result.content[0]?.text);
  const images = result.content.filter((item) => item.type === 'image');
  assert.equal(images.length, 1);
  assert.equal(images[0].mimeType, 'image/png');
  assert.equal(Buffer.from(images[0].data, 'base64').subarray(1, 4).toString(), 'PNG');

  const { files } = JSON.parse(result.content.find((item) => item.type === 'text').text);
  assert.equal(files.length, 1);
  assert.match(path.basename(files[0]), /^001-guest1-after-move\.png$/);
  const sheet = await readFile(path.join(path.dirname(files[0]), 'index.html'), 'utf8');
  assert.ok(sheet.includes(path.basename(files[0])), 'the contact sheet shows the capture');
});

test('screenshot with no player captures every player as one step', async () => {
  const result = await fixture.client.callTool({ name: 'screenshot', arguments: {} });
  assert.equal(result.content.filter((item) => item.type === 'image').length, 2);
  const { files } = JSON.parse(result.content.find((item) => item.type === 'text').text);
  assert.deepEqual(files.map((file) => path.basename(file)), ['002-host.png', '002-guest1.png']);
  const run = await readdir(path.dirname(files[0]));
  assert.deepEqual(run.toSorted(), ['001-guest1-after-move.png', '002-guest1.png', '002-host.png', 'index.html']);
});

test('game_join seats a new named player at a table by its code; table talk flows both ways', async () => {
  const { data: started } = await call('game_start', { players: 1, preset: 'Gin Rummy', cardsPerPlayer: 10 });
  const { data: joined } = await call('game_join', { code: started.code, player: 'bot', name: 'Bot (knock-early)' });
  assert.deepEqual(joined.players, ['host', 'bot']);
  const { result: seated } = await call('player_wait', { player: 'host', predicate: '(view) => view.players.length === 2', path: 'players.1.name' });
  assert.equal(JSON.parse(seated.content[0].text), 'Bot (knock-early)');

  await call('player_say', { player: 'bot', text: 'hello', data: { hi: true } });
  // player_say returns once a line is SENT: the guest's line still has
  // to cross WebRTC to be stamped, while the host stamps its own at once.
  // Wait for the stamp, or the order below is a race.
  await call('player_talk', { player: 'host', waitFor: 1 });
  await call('player_say', { player: 'host', text: 'welcome' });
  const { data: heard } = await call('player_talk', { player: 'bot', waitFor: 2 });
  assert.deepEqual(heard.map(({ name, text }) => [name, text]), [['Bot (knock-early)', 'hello'], ['Host', 'welcome']]);
});

test('a guest\'s "/roll" crosses WebRTC and comes back ROLLED BY THE HOST, for everyone', async () => {
  const { data: before } = await call('player_talk', { player: 'host' });
  await call('player_say', { player: 'bot', text: '/roll 2d6 x3' });
  const { data: heard } = await call('player_talk', { player: 'host', waitFor: before.length + 1 });
  const roll = heard.at(-1);
  assert.equal(roll.name, 'Bot (knock-early)', 'the roller is who asked');
  assert.match(roll.text, /^rolled 2d6 x3: /);
  assert.equal(roll.data.kind, 'dice');
  assert.equal(roll.data.results.length, 3);
  assert.ok(roll.data.results.flat().every((value) => value >= 1 && value <= 6));
  const { data: botHeard } = await call('player_talk', { player: 'bot', waitFor: before.length + 1 });
  assert.deepEqual(botHeard.at(-1).data, roll.data, 'the guest sees the same roll the host made');
});

test('gin_turn: one bot decision as a typed record - a bot dealt no cards just waits', async () => {
  const { data: record } = await call('gin_turn', { player: 'bot', strategy: 'knock-early', waitMs: 500 });
  assert.equal(record.phase, 'wait');
  assert.equal(record.decision, null);
  assert.equal(record.strategy, 'knock-early');
  const { result } = await call('gin_turn', { player: 'bot', strategy: 'no-such' });
  assert.ok(result.isError);
  assert.match(result.content[0].text, /knock-early, gin-hunter, equilibrium, defensive/);
});
