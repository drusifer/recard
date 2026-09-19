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

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const SYSTEM_CHROMIUM_PATHS = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
const JOIN_TIMEOUT_MS = 20_000;
const VIEW_TIMEOUT_MS = 15_000;

/**
 * Serves the repo root statically on `port`; resolves `{ baseUrl, close() }`.
 */
export async function startStaticServer(port) {
  const server = http.createServer(async (request, response) => {
    const pathname = decodeURIComponent(request.url.split('?', 1)[0]);
    // Resolve to the real file BEFORE reading its extension: `extname('/')`
    // is empty, and typing the root as octet-stream makes the browser
    // DOWNLOAD index.html instead of rendering it.
    const filePath = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
    try {
      const body = await readFile(filePath);
      response.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] ?? 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end('not found');
    }
  });
  await new Promise((resolve) => server.listen(port, resolve));
  return {
    baseUrl: `http://localhost:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/**
 * Playwright's bundled Chromium, falling back to a system install.
 */
export async function launchChromium() {
  try {
    return await chromium.launch({ args: ['--no-sandbox'] });
  } catch (error) {
    for (const executablePath of SYSTEM_CHROMIUM_PATHS) {
      try {
        return await chromium.launch({ executablePath, args: ['--no-sandbox'] });
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

async function openPeer(browser, baseUrl) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(baseUrl);
  return { peer: new HarnessPeer(page), context };
}

/**
 * Hosts a new table (not dealt yet). Resolves `{ host, code, close() }`.
 */
export async function hostTable({ browser, baseUrl, preset }) {
  const { peer: host, context } = await openPeer(browser, baseUrl);
  await host.page.click('#show-host');
  if (preset) await host.page.selectOption('#host-preset', { label: preset });
  await host.page.click('#create-table');
  await host.page.waitForSelector('#host-share:not([hidden])', { timeout: JOIN_TIMEOUT_MS });
  return { host, code: await host.myId(), close: () => context.close() };
}

/**
 * Joins the table `code` as `name` through the real join screen - its own
 * browser context, so its own player identity. `baseUrl` serves the app
 * the guest runs; the host can be anywhere the PeerJS broker reaches (a
 * table someone else is hosting). Resolves `{ peer, close() }` once the
 * join is sent; the host decides when it is seated.
 */
export async function joinTable({ browser, baseUrl, code, name }) {
  const { peer, context } = await openPeer(browser, baseUrl);
  await peer.page.click('#show-join');
  await peer.page.fill('#join-name', name);
  await peer.page.fill('#join-code', code);
  await peer.page.click('#join-btn');
  return { peer, close: () => context.close() };
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
export async function createTable({ browser, baseUrl, players, preset, cardsPerPlayer }) {
  const hosted = await hostTable({ browser, baseUrl, preset });
  const closers = [hosted.close];
  const guests = [];
  for (let index = 1; index < players; index++) {
    const joined = await joinTable({ browser, baseUrl, code: hosted.code, name: `Guest ${index}` });
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
