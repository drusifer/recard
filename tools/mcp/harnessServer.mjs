// US-119: an MCP server over the multi-player harness (US-118/D135), so
// an agent can start a real Recard table, act as any player, read each
// player's view/DOM/WebRTC traffic, and (Phase 3) screenshot it -
// without writing a test file first.
//
// A thin tool layer: `tests/harness/multiplayer.mjs` stays the ONE place
// that knows how to stand a table up. One long-lived process owns one
// browser + static server + table; `game_start` replaces whatever ran
// before. Headless only (user decision at the US-119 Smith gate).
// stdout carries JSON-RPC, so this file never writes to it.
//
// Run: `npm run harness-mcp` (registered as `recard-harness` in .mcp.json).
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import { launchChromium, startStaticServer, createTable, joinTable } from '../../tests/harness/multiplayer.mjs';
import { GinBot, summaryLine } from '../gin/bot.mjs';
import { STRATEGIES } from '../gin/strategies.mjs';

const PORT = Number(process.env.RECARD_HARNESS_PORT ?? 8220);
const SCREENSHOT_ROOT = process.env.RECARD_SCREENSHOT_DIR
  ?? fileURLToPath(new URL('../../build/screenshots', import.meta.url));

/**
 * The running game, if any. `players` maps a stable NAME (`host`,
 * `guest1`, ...) to its harness peer - names, not PeerJS ids, because
 * an agent addresses players across calls and ids change per table.
 */
const game = { staticServer: undefined, browser: undefined, table: undefined, players: new Map(), shots: undefined, closers: [], bots: new Map() };

async function stopGame() {
  await Promise.all(game.closers.map((close) => close()));
  await game.table?.close();
  await game.browser?.close();
  await game.staticServer?.close();
  Object.assign(game, { staticServer: undefined, browser: undefined, table: undefined, shots: undefined, closers: [] });
  game.players.clear();
  game.bots.clear();
}

function player(name) {
  const peer = game.players.get(name);
  if (peer) return peer;
  const known = game.players.keys().toArray();
  throw new Error(known.length > 0
    ? `No player "${name}" - this table has: ${known.join(', ')}`
    : `No player "${name}" - no game is running (call game_start first)`);
}

/**
 * Dotted path into a view (`piles.0.cards`) - whole views are large.
 */
function pick(value, path) {
  if (!path) return value;
  const keys = path.split('.');
  let node = value;
  for (const key of keys) node = node?.[key];
  return node;
}

const asJson = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value ?? null, null, 1) }] });

/**
 * An error thrown inside a player's page reaches us as Playwright's
 * `page.evaluate: Error: <message>` followed by the in-page stack. The
 * agent only needs the app's own message - the first line, unwrapped.
 */
function errorText(error) {
  const [firstLine] = error.message.split('\n', 1);
  return firstLine.replace(/^page\.\w+: (?:Error: )?/, '');
}

/**
 * Every tool body goes through here: a thrown error becomes an MCP tool
 * error carrying its message, so one bad call never kills the server
 * (or the table the agent is in the middle of).
 */
function tool(handler) {
  return async (arguments_) => {
    try {
      return await handler(arguments_);
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: errorText(error) }] };
    }
  };
}

const server = new McpServer({ name: 'recard-harness', version: '1.0.0' });
const playerName = z.string().describe('host, guest1, guest2, ...');

server.registerTool('game_start', {
  description: 'Start a live Recard table: a host plus (players - 1) guests, each a real headless browser joined over the real WebRTC/PeerJS broker, then dealt. Stops any table already running.',
  inputSchema: {
    players: z.number().int().min(1).max(8).describe('total players, host included'),
    preset: z.string().optional().describe('preset label, e.g. "War" (default) or "Recard the Gathering"'),
    cardsPerPlayer: z.number().int().min(0).default(5),
  },
}, tool(async ({ players, preset, cardsPerPlayer }) => {
  await stopGame();
  await startBrowser();
  game.table = await createTable({ browser: game.browser, baseUrl: game.staticServer.baseUrl, players, preset, cardsPerPlayer });
  game.players.set('host', game.table.host);
  for (const [index, guest] of game.table.guests.entries()) game.players.set(`guest${index + 1}`, guest);
  return asJson({ players: game.players.keys().toArray(), code: await game.table.host.myId() });
}));

async function startBrowser() {
  game.staticServer = await startStaticServer(PORT);
  game.browser = await launchChromium();
  // One screenshot folder per game, so a run's contact sheet is that game only.
  game.shots = { dir: path.join(SCREENSHOT_ROOT, new Date().toISOString().replaceAll(':', '-')), steps: [] };
}

server.registerTool('game_join', {
  description: 'Seat a new named player at a table by its code - one this server started, or one a person is hosting in their own browser (US-120). Joins through the real join screen over WebRTC and returns once the host has seated it.',
  inputSchema: {
    code: z.string().describe('the table code the host shows'),
    player: z.string().describe('the name tools address this player by, e.g. "bot"'),
    name: z.string().optional().describe('the seat name everyone at the table sees (default: `player`)'),
  },
}, tool(async ({ code, player: name, name: seatName }) => {
  if (game.players.has(name)) throw new Error(`There is already a player "${name}" - pick another name`);
  if (!game.browser) await startBrowser();
  const joined = await joinTable({ browser: game.browser, baseUrl: game.staticServer.baseUrl, code, name: seatName ?? name });
  game.closers.push(joined.close);
  await joined.peer.waitForSeat();
  game.players.set(name, joined.peer);
  return asJson({ players: game.players.keys().toArray() });
}));

server.registerTool('gin_turn', {
  description: 'Gin Rummy bot (US-120): wait (bounded) for this player\'s move, then make ONE decision with the named strategy - code rules plus live Jev judgments for Jev strategies (needs TYPESAFE_API_KEY) - and act it out. Returns the typed record: observation, facts, judgments, rules fired, decision, actions, announcement.',
  inputSchema: {
    player: playerName,
    strategy: z.string().describe(`one of: ${Object.keys(STRATEGIES).join(', ')}`),
    firstPlayer: z.enum(['bot', 'opponent']).default('bot').describe('who draws first in a hand'),
    waitMs: z.number().int().positive().max(600_000).default(30_000).describe('how long to wait for this player\'s move'),
  },
}, tool(async ({ player: name, strategy: strategyName, firstPlayer, waitMs }) => {
  const peer = player(name);
  const strategy = STRATEGIES[strategyName];
  if (!strategy) throw new Error(`Unknown strategy "${strategyName}" - choose one of: ${Object.keys(STRATEGIES).join(', ')}`);
  let entry = game.bots.get(name);
  if (entry && entry.strategy !== strategyName) throw new Error(`"${name}" is already playing ${entry.strategy} - one strategy per player per game`);
  if (!entry) {
    entry = { strategy: strategyName, bot: new GinBot({ peer, strategy, judge: strategy.usesJev ? new TypeSafeClient() : null, firstPlayer }) };
    game.bots.set(name, entry);
  }
  await entry.bot.waitForTurn({ timeoutMs: waitMs });
  const record = await entry.bot.step();
  return asJson({ summary: summaryLine(record), ...record });
}));

server.registerTool('game_status', {
  description: 'Every player of the running table (name, player id, hand size) and every pile as the host sees it (id, name, kind, card count) - the ids player_act takes.',
}, tool(async () => {
  const players = [];
  for (const [name, peer] of game.players) {
    const view = await peer.view();
    players.push({ name, id: await peer.myId(), handSize: view?.myHand.length ?? 0 });
  }
  const hostView = await game.players.get('host')?.view();
  const piles = (hostView?.piles ?? []).map(({ id, name, kind, cards }) => ({ id, name, kind, cards: cards.length }));
  return asJson({ running: game.players.size > 0, players, piles });
}));

server.registerTool('game_stop', {
  description: 'Close every player\'s browser and stop the table.',
}, tool(async () => {
  await stopGame();
  return asJson({ stopped: true });
}));

server.registerTool('player_act', {
  description: 'Perform a reducer action as this player, e.g. {"type":"DRAW","pileId":"deck"} or {"type":"MOVE","pileableId":"...","toPileId":"table"}. Goes through submitAction - the same funnel a UI button uses (a guest\'s action crosses the real data channel to the host). Returns once sent; use player_wait to await convergence.',
  inputSchema: { player: playerName, action: z.record(z.string(), z.unknown()) },
}, tool(async ({ player: name, action }) => {
  await player(name).act(action);
  return asJson({ sent: action });
}));

server.registerTool('player_view', {
  description: 'This player\'s current structured view (what it renders from). Views are large - pass a dotted `path` (e.g. "myHand", "piles.0.cards", "players") to return just that part.',
  inputSchema: { player: playerName, path: z.string().optional() },
}, tool(async ({ player: name, path }) => asJson(pick(await player(name).view(), path))));

server.registerTool('player_wait', {
  description: 'Wait until a predicate holds on this player\'s view, then return that view\'s `path` (or the whole view). `predicate` is JS source for `(view, arg) => boolean`; it runs inside the player\'s page, so it must be self-contained - pass values through `arg`.',
  inputSchema: {
    player: playerName,
    predicate: z.string(),
    arg: z.unknown().optional(),
    timeoutMs: z.number().int().positive().max(60_000).default(15_000),
    path: z.string().optional(),
  },
}, tool(async ({ player: name, predicate, arg, timeoutMs, path }) => {
  const peer = player(name);
  try {
    return asJson(pick(await peer.waitForView(predicate, arg, { timeout: timeoutMs }), path));
  } catch (error) {
    if (error.name !== 'TimeoutError') throw error;
    const now = JSON.stringify(pick(await peer.view(), path) ?? null);
    throw new Error(`Timed out after ${timeoutMs}ms waiting for ${predicate} - ${path ?? 'the view'} is now: ${now}`, { cause: error });
  }
}));

server.registerTool('player_say', {
  description: 'Say a line of table talk as this player (D138) - what the game protocol does not encode. Optional `data` is JSON for machines. The host stamps who said it and relays it to everyone.',
  inputSchema: { player: playerName, text: z.string().min(1), data: z.unknown().optional() },
}, tool(async ({ player: name, text, data }) => {
  await player(name).say(text, data);
  return asJson({ said: text });
}));

server.registerTool('player_talk', {
  description: 'This player\'s table-talk log, in the host\'s order: [{seq, at, from, name, text, data?}]. `waitFor` waits (bounded) until at least that many lines have arrived.',
  inputSchema: { player: playerName, waitFor: z.number().int().positive().optional(), timeoutMs: z.number().int().positive().max(60_000).default(15_000) },
}, tool(async ({ player: name, waitFor, timeoutMs }) => {
  const peer = player(name);
  return asJson(waitFor ? await peer.waitForTalk(waitFor, { timeout: timeoutMs }) : await peer.talk());
}));

server.registerTool('player_query', {
  description: 'Inspect this player\'s DOM: for each CSS selector, every match\'s text, classes, data-* attributes and on-screen rect.',
  inputSchema: { player: playerName, selectors: z.array(z.string()).min(1) },
}, tool(async ({ player: name, selectors }) => asJson(await player(name).query(selectors))));

server.registerTool('player_traffic', {
  description: 'This player\'s recent WebRTC protocol messages, sent and received (read-only): [{seq, at, direction: "in"|"out", peer, type, message}], oldest first. Filter by `type` (action | state | motion | identity); `limit` keeps the newest N.',
  inputSchema: { player: playerName, type: z.string().optional(), limit: z.number().int().positive().default(50) },
}, tool(async ({ player: name, type, limit }) => asJson(await player(name).traffic({ type, limit }))));

/**
 * The run's contact sheet: one row per capture step (a single
 * `screenshot` call), one column per player, each linking to the
 * full-size PNG. Rewritten after every capture, so a person can keep it
 * open and refresh while an agent works.
 */
const escapeHtml = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

function sheetCell(file, name) {
  if (!file) return '<td></td>';
  const href = escapeHtml(file);
  return `<td><a href="${href}"><img src="${href}" alt="${escapeHtml(name)}"></a></td>`;
}

function sheetRow({ step, label, files }, players) {
  const title = label ? step + '<br>' + escapeHtml(label) : step;
  return `<tr><th>${title}</th>${players.map((name) => sheetCell(files[name], name)).join('')}</tr>`;
}

function contactSheet(steps, players) {
  const header = players.map((name) => `<th>${escapeHtml(name)}</th>`).join('');
  const rows = steps.map((step) => sheetRow(step, players)).join('\n');
  return `<!doctype html><meta charset="utf-8"><title>Recard harness screenshots</title>
<style>body{font:14px system-ui;background:#111;color:#ddd}table{border-collapse:collapse}td,th{border:1px solid #333;padding:4px;vertical-align:top}img{width:420px;display:block}</style>
<table><tr><th>step</th>${header}</tr>
${rows}
</table>`;
}

const slug = (text) => text.toLowerCase().replaceAll(/[^a-z\d]+/g, '-').replaceAll(/^-|-$/g, '');

server.registerTool('screenshot', {
  description: 'Screenshot one player (or every player when `player` is omitted). Returns the PNG(s) inline, and saves them under build/screenshots/<game>/ with an index.html contact sheet (one row per capture, one column per player) for a person to review.',
  inputSchema: {
    player: playerName.optional(),
    label: z.string().optional().describe('what this capture shows, e.g. "after deal"'),
    fullPage: z.boolean().default(false),
  },
}, tool(async ({ player: name, label, fullPage }) => {
  if (name) player(name); // throws a clear error for an unknown name
  const names = name ? [name] : game.players.keys().toArray();
  if (names.length === 0) throw new Error('No game is running (call game_start first)');
  const step = String(game.shots.steps.length + 1).padStart(3, '0');
  await mkdir(game.shots.dir, { recursive: true });
  const files = {};
  const content = [];
  for (const each of names) {
    const file = [step, each, label && slug(label)].filter(Boolean).join('-') + '.png';
    const png = await game.players.get(each).page.screenshot({ fullPage });
    await writeFile(path.join(game.shots.dir, file), png);
    files[each] = file;
    content.push({ type: 'image', data: png.toString('base64'), mimeType: 'image/png' });
  }
  game.shots.steps.push({ step, label, files });
  await writeFile(path.join(game.shots.dir, 'index.html'), contactSheet(game.shots.steps, game.players.keys().toArray()));
  const saved = Object.values(files).map((file) => path.join(game.shots.dir, file));
  return { content: [{ type: 'text', text: JSON.stringify({ files: saved, contactSheet: path.join(game.shots.dir, 'index.html') }) }, ...content] };
}));

// The MCP host closing our stdin (or a Ctrl-C) ends the session: close
// every browser rather than orphaning headless Chromium processes.
async function shutdown() {
  await stopGame();
  // eslint-disable-next-line unicorn/no-process-exit -- this IS the CLI entry point; open handles must not keep it alive
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.stdin.on('close', shutdown);

await server.connect(new StdioServerTransport());
