// US-118: the multi-player test harness - the ONE place that knows how
// to serve the app, launch a browser, and stand up a table of real
// peers. Every browser test file imports its server/browser from here.
//
// A peer is a real headless Chromium page joined over the real PeerJS
// broker. After setup, tests drive peers by PROTOCOL actions through
// the page's own `window.__recardHarness` hook (`main.js`), which calls
// `submitAction` - the same funnel every UI button uses - so a host
// action is reduced locally and a guest action crosses the real data
// channel. DOM inspection stays local to the controller (`query`), per
// the design: no peer is outside this process's own reach.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startLocalPeerServer } from '../../tools/localPeerServer.mjs';
import { peerOptionsFromSearch, withPeerConfig } from '../../src/peerOptions.js';
import { sharedTurnRelay } from '../../tools/turnRelay.mjs';
import { CLIENT_SESSION_STORAGE } from '../../src/identity.js';
import { gameMasterAddress, INVITE_MESSAGE, ACCEPTED_MESSAGE } from '../../src/gameMasterInvite.js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const SYSTEM_CHROMIUM_PATHS = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
const JOIN_TIMEOUT_MS = 20_000;
const JOIN_ATTEMPTS = 3;
const VIEW_TIMEOUT_MS = 15_000;
const LOCAL_PEER_PORT = 9000;

// Real WebRTC, but signaled through a LOCAL broker by default (see
// `tools/localPeerServer.mjs`) rather than the public one - every
// browser test file that opens a table through this harness gets it for
// free. One shared server per test-file process, started lazily on
// first use; `realBroker: true` (on `hostTable`/`joinTable`/`createTable`)
// opts a specific call back out, for the one suite that still has to
// prove the real public broker isn't broken.
const localPeer = { promise: undefined };
function ensureLocalPeerServer() {
  localPeer.promise ??= startLocalPeerServer(LOCAL_PEER_PORT);
  return localPeer.promise;
}

/**
 * The shared local signaling server's own `{ queryString, close() }`,
 * starting it if this file's process hasn't yet. For a test that spawns
 * a REAL CLI as a separate process (`jev-player`, `jev-game-master`) to
 * join a table this process is hosting in-browser: that CLI defaults to
 * the public broker (D172), so its own `--url` needs this query string
 * appended too, or it will never find a host signaling locally.
 */
export function localPeerServer() {
  return ensureLocalPeerServer();
}

/**
 * Shuts down the shared local signaling server, if this file's process
 * ever started one. Every test file's `after()` calls this once,
 * alongside closing its own static server/browser - harmless, and
 * necessary, even for a file whose tests never opened a table.
 */
export async function closeLocalPeerServer() {
  if (!localPeer.promise) return;
  const server = await localPeer.promise;
  localPeer.promise = undefined;
  await server.close();
}

/**
 * Serves the repo root statically on `port` (0 = any free port);
 * resolves `{ baseUrl, close() }`. US-152: a pod exposes this, so a path
 * that resolves outside the root is a 404 and a malformed `%` a 400.
 */
export async function startStaticServer(port) {
  const server = http.createServer(async (request, response) => {
    const answer = (status, body) => {
      response.writeHead(status);
      response.end(body);
    };
    let pathname;
    try {
      pathname = decodeURIComponent(request.url.split('?', 1)[0]);
    } catch {
      return answer(400, 'bad request');
    }
    // Resolve to the real file BEFORE reading its extension: `extname('/')`
    // is empty, and typing the root as octet-stream makes the browser
    // DOWNLOAD index.html instead of rendering it.
    const filePath = path.resolve(ROOT, '.' + (pathname === '/' ? '/index.html' : pathname));
    const inside = path.relative(ROOT, filePath);
    if (inside === '..' || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside)) return answer(404, 'not found');
    try {
      const body = await readFile(filePath);
      response.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] ?? 'application/octet-stream' });
      response.end(body);
    } catch {
      answer(404, 'not found');
    }
  });
  await new Promise((resolve) => server.listen(port, resolve));
  return {
    baseUrl: `http://localhost:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/**
 * Playwright's bundled Chromium, falling back to a system install.
 */
/**
 * US-123/D144: cards travel to their new place now, so a browser test
 * that measures geometry would otherwise race the animation. Every
 * suite launches with reduced motion forced ON (browser-wide, so a
 * suite that builds its own contexts gets it too); a suite ABOUT the
 * motion passes `{ motion: true }`.
 *
 * `handleSIGINT: false` is for a tool that owns its own Ctrl-C handling:
 * Playwright's default handler closes the browser and calls
 * `process.exit(130)` itself, ahead of any shutdown the tool was in the
 * middle of (D159 - `jev-table` exited in ~0s with every bot still
 * running).
 */
export async function launchChromium({ motion = false, handleSIGINT = true } = {}) {
  const arguments_ = ['--no-sandbox'];
  const launched = await launchAnyChromium(arguments_, handleSIGINT);
  if (motion) return launched;
  // Reduced motion has to be set per CONTEXT - Chromium's
  // `--force-prefers-reduced-motion` flag does NOT reach `matchMedia`
  // (checked directly). Wrapping `newContext` here means every suite
  // gets it, including the ones that build their own contexts, without
  // each one remembering to ask.
  const newContext = launched.newContext.bind(launched);
  launched.newContext = (options = {}) => newContext({ reducedMotion: 'reduce', ...options });
  return launched;
}

async function launchAnyChromium(arguments_, handleSIGINT) {
  try {
    return await chromium.launch({ args: arguments_, handleSIGINT });
  } catch (error) {
    for (const executablePath of SYSTEM_CHROMIUM_PATHS) {
      try {
        return await chromium.launch({ executablePath, args: arguments_, handleSIGINT });
      } catch { /* try the next candidate */ }
    }
    throw error;
  }
}

/**
 * One player's page, driven through its `window.__recardHarness` hook.
 */
class HarnessPeer {
  constructor(page) {
    this.page = page;
  }

  act(action) {
    return this.page.evaluate((a) => globalThis.__recardHarness.act(a), action);
  }

  view() {
    return this.page.evaluate(() => globalThis.__recardHarness.view());
  }

  myId() {
    return this.page.evaluate(() => globalThis.__recardHarness.myId());
  }

  /**
   * Waits until the host has seated this player under its own identity.
   */
  waitForSeat({ timeout = JOIN_TIMEOUT_MS } = {}) {
    return this.page.waitForFunction(() => {
      const harness = globalThis.__recardHarness;
      return harness.view()?.players.some((player) => player.id === harness.myId());
    }, undefined, { timeout });
  }

  /** US-124: 'player' or 'spectator' - what the HOST actually seated
   *  this peer as, which is not always what it asked for. */
  async myRole() {
    return this.page.evaluate(() => {
      const harness = globalThis.__recardHarness;
      return harness.view()?.players.find((player) => player.id === harness.myId())?.role ?? null;
    });
  }

  /**
   * Say a line of table talk (D138), with optional structured data.
   */
  say(text, data) {
    return this.page.evaluate(([t, d]) => globalThis.__recardHarness.say(t, d), [text, data]);
  }

  /**
   * This player's table-talk log, host-ordered (D138).
   */
  talk() {
    return this.page.evaluate(() => globalThis.__recardHarness.talk());
  }

  /**
   * Waits until this player's table-talk log holds at least `count` lines.
   */
  async waitForTalk(count, { timeout = VIEW_TIMEOUT_MS } = {}) {
    await this.page.waitForFunction((n) => globalThis.__recardHarness.talk().length >= n, count, { timeout });
    return this.talk();
  }

  /**
   * US-146/D168 test player: a real mouse-down/move/up sequence over a
   * pile's own DOM position - not a synthetic event dispatch - so it
   * drives `main.js`'s real `pointerdown`/`pointermove` listener exactly
   * the way a person dragging over the table would. Three steps, not
   * one, so a test can hover several piles across the SAME gesture,
   * matching what a real drag does.
   */
  pointerDown() {
    return this.page.mouse.down();
  }

  async hoverPile(pileId) {
    const box = await this.page.locator(`[data-pile-id="${pileId}"]`).first().boundingBox();
    await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  }

  pointerUp() {
    return this.page.mouse.up();
  }

  /**
   * This player's WebRTC protocol traffic (US-119), `{ type, limit }`.
   */
  traffic(options) {
    return this.page.evaluate((o) => globalThis.__recardHarness.traffic(o), options);
  }

  /**
   * Waits until `predicate(view, argument)` holds on this peer's own
   * view, then returns that view. Convergence is awaited, never slept
   * for. `predicate` runs IN the page, so it must be self-contained -
   * pass anything it needs through `argument` (JSON-serializable).
   */
  async waitForView(predicate, argument, { timeout = VIEW_TIMEOUT_MS } = {}) {
    const expression = `(() => {
      const view = globalThis.__recardHarness.view();
      return view != null && (${predicate})(view, ${JSON.stringify(argument)});
    })()`;
    await this.page.waitForFunction(expression, undefined, { timeout });
    return this.view();
  }

  /**
   * `{ [selector]: [{ text, classes, dataset, rect }] }` for every match of each selector.
   */
  query(selectors) {
    return this.page.evaluate((list) => Object.fromEntries(list.map((selector) => [
      selector,
      [...document.querySelectorAll(selector)].map((element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { text: element.textContent, classes: [...element.classList], dataset: { ...element.dataset }, rect: { x, y, width, height } };
      }),
    ])), selectors);
  }
}

/**
 * US-123/D144: browser tests run with reduced motion ON by default, so
 * a geometry assertion measures where a card IS rather than racing its
 * travel. A test about the motion itself passes `motion: true`.
 */
async function openPeer(browser, baseUrl, { realBroker = false } = {}) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const url = realBroker ? baseUrl : baseUrl + (await ensureLocalPeerServer()).queryString;
  // US-151/D176: relayed through Cloudflare TURN when this process's env
  // asks for it; otherwise the URL is exactly as before.
  const relay = await sharedTurnRelay();
  await page.goto(withPeerConfig(url, relay?.config()));
  return { peer: new HarnessPeer(page), context };
}

/**
 * US-150/D175: holds a listening game master's PeerJS address in a page
 * of its own (the app page already loads `window.Peer`) and hands each
 * invite's table code to `onInvite`, answering "accepted" once it
 * returns. Rejects with `{ type: 'unavailable-id' }` (PeerJS's own) when
 * the address is already held. Drops from the broker are reconnected,
 * so a long-running listener outlives them. `relay` defaults to this
 * process's own (`sharedTurnRelay`); its refreshes reach the page.
 * Resolves `{ iceConfig(), close() }` (`iceConfig` is what PeerJS will
 * build the next connection from).
 */
export async function listenAsGameMaster({ browser, baseUrl, name, onInvite, relay }) {
  const { peer, context } = await openPeer(browser, baseUrl, { realBroker: true });
  await peer.page.exposeFunction('__recardGameMasterInvite', onInvite);
  // Everything the page needs is worked out here and passed in, not
  // imported inside the page - so this file's import graph (what
  // `make dist` packages, D174) is exactly what Node itself runs.
  const settings = {
    address: gameMasterAddress(name),
    options: peerOptionsFromSearch(new URL(peer.page.url()).search),
    invite: INVITE_MESSAGE,
    accepted: ACCEPTED_MESSAGE,
  };
  // The Peer stays in the page; Node keeps a handle to it (for TURN
  // refreshes, below) rather than publishing it on the page's global.
  const held = await peer.page.evaluateHandle(({ address, options, invite, accepted }) => {
    const listening = new globalThis.Peer(address, options);
    listening.on('disconnected', () => { if (!listening.destroyed) listening.reconnect(); });
    listening.on('connection', (conn) => conn.on('data', async (message) => {
      if (message?.kind !== invite || typeof message.code !== 'string') return;
      await globalThis.__recardGameMasterInvite(message.code);
      conn.send({ kind: accepted });
    }));
    const ready = new Promise((resolve) => {
      listening.on('open', () => resolve(null));
      listening.on('error', (error) => resolve({ type: error.type, message: String(error.message) }));
    });
    return { listening, ready };
  }, settings);
  const failure = await held.evaluate(({ ready }) => ready);
  if (failure) {
    await context.close();
    throw Object.assign(new Error(failure.message), { type: failure.type });
  }
  // US-151/D176: this page lives for days, past any one set of TURN
  // credentials. PeerJS builds each new RTCPeerConnection from
  // `peer.options.config`, so a refreshed set written there is what the
  // next invite's connection uses.
  const stopRefresh = (relay ?? await sharedTurnRelay())?.onRefresh(async (config) => {
    try {
      await held.evaluate(({ listening }, fresh) => { listening.options.config = fresh; }, config);
    } catch {
      // The page closed under a refresh: nothing left to update.
    }
  });
  return {
    iceConfig: () => held.evaluate(({ listening }) => listening.options.config),
    close: () => {
      stopRefresh?.();
      return context.close();
    },
  };
}

/**
 * Hosts a new table (not dealt yet). Resolves `{ host, code, close() }`.
 */
export async function hostTable({ browser, baseUrl, preset, spectate, realBroker }) {
  const { peer: host, context } = await openPeer(browser, baseUrl, { realBroker });
  await host.page.click('#show-host');
  if (preset) await host.page.selectOption('#host-preset', { label: preset });
  // US-124: host the table without taking a seat in the game.
  if (spectate) await host.page.check('#host-spectate');
  await host.page.click('#create-table');
  await host.page.waitForSelector('#host-share:not([hidden])', { timeout: JOIN_TIMEOUT_MS });
  return { host, code: await host.myId(), close: () => context.close() };
}

/**
 * Joins the table `code` as `name` through the real join screen - its own
 * browser context, so its own player identity. `baseUrl` serves the app
 * the guest runs; the host can be anywhere the PeerJS broker reaches (a
 * table someone else is hosting). Resolves `{ peer, close() }` once the
 * host has SEATED it (as a player, or as a spectator when it asked to
 * watch or the game is full).
 *
 * US-150: a headless join occasionally never gets seated (found live:
 * about 3 runs in 7 with five browsers joining on one box), and a bot
 * can't press Join again the way a person would. So each attempt gets
 * JOIN_TIMEOUT_MS, and up to JOIN_ATTEMPTS are made. A retry reloads
 * the SAME context: the player key in its storage is kept, so the host
 * reunites it with whatever seat a half-finished attempt got (US-38),
 * rather than leaving a ghost holding one. Only the remembered session
 * is cleared, so the reload shows the join form instead of auto-rejoining.
 */
export async function joinTable({ browser, baseUrl, code, name, role, realBroker }) {
  const { peer, context } = await openPeer(browser, baseUrl, { realBroker });
  for (let attempt = 1; ; attempt += 1) {
    await peer.page.click('#show-join');
    await peer.page.fill('#join-name', name);
    await peer.page.fill('#join-code', code);
    // US-124: what this joiner ASKS to be. Omitted, the select keeps its
    // default ('player').
    if (role) await peer.page.selectOption('#join-role', role);
    await peer.page.click('#join-btn');
    try {
      await peer.waitForSeat({ timeout: JOIN_TIMEOUT_MS });
      return { peer, close: () => context.close() };
    } catch (error) {
      if (attempt === JOIN_ATTEMPTS) {
        await context.close();
        throw new Error(`not seated at ${code} after ${JOIN_ATTEMPTS} tries of ${JOIN_TIMEOUT_MS / 1000}s - is the table open, and hosted from the same Recard version?`, { cause: error });
      }
      await peer.page.evaluate((key) => localStorage.removeItem(key), CLIENT_SESSION_STORAGE);
      await peer.page.reload();
    }
  }
}

/**
 * Waits for `players` connected seats on the host, then deals
 * `cardsPerPlayer` through the real Deal button, and waits for every
 * guest to hold its deal under its host-assigned identity.
 */
export async function dealTable(host, guests, { players, cardsPerPlayer }) {
  await host.waitForView((view, count) => view.players.filter((p) => p.connection === 'connected').length === count, players, { timeout: JOIN_TIMEOUT_MS });
  await host.page.fill('#cards-per-player', String(cardsPerPlayer));
  await host.page.click('#deal-btn');
  for (const guest of guests) {
    // Seated under its host-assigned identity AND holding its deal - the
    // identity message can race the state broadcast (see main.js).
    await guest.page.waitForFunction((count) => {
      const harness = globalThis.__recardHarness;
      return harness.view()?.myHand.length === count && harness.view().players.some((p) => p.id === harness.myId());
    }, cardsPerPlayer, { timeout: VIEW_TIMEOUT_MS });
  }
}

/**
 * Stands up a table: a host plus `players - 1` guests, each in its own
 * browser context (separate localStorage, so separate player identities),
 * joined by the real table code, then started with a real Deal of
 * `cardsPerPlayer`. Resolves `{ host, guests, close() }`.
 */
export async function createTable({ browser, baseUrl, players, preset, cardsPerPlayer, spectate, realBroker }) {
  const hosted = await hostTable({ browser, baseUrl, preset, spectate, realBroker });
  const closers = [hosted.close];
  const guests = [];
  for (let index = 1; index < players; index++) {
    const joined = await joinTable({ browser, baseUrl, code: hosted.code, name: `Guest ${index}`, realBroker });
    closers.push(joined.close);
    guests.push(joined.peer);
  }
  await dealTable(hosted.host, guests, { players, cardsPerPlayer });
  return {
    host: hosted.host,
    guests,
    close: () => Promise.all(closers.map((close) => close())),
  };
}
