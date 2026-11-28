// The end-to-end test of the reader engine, in Chromium, WebKit and Firefox. It builds the test page
// (harness/: the host page with `Engine` and the real engine page, `reader-frame.html`, CSP included), serves it
// locally and drives it with Playwright at a phone's and a laptop's size.
// Usage: node packages/reader/e2e/run.mjs [--browsers chromium,webkit,firefox] [--out reader-e2e.json]
// It needs `playwright` and its browsers, which are not dependencies of this repository.
// It writes the results and exits with 1 when a scenario fails.
import { createReadStream, existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const HERE = dirname(fileURLToPath(import.meta.url));
const ALL = ['chromium', 'webkit', 'firefox'];
const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844, narrower: 320 },
  { name: 'laptop', width: 1280, height: 800, narrower: 900 },
];
/** A page turn above this is a delay a reader notices. */
const BUDGET_MS = 100;
const TURNS = 100;
const SEARCH_TURNS = 20;
/** The engine must have been silent this long before the next turn (see TURN). */
const QUIET_MS = 250;
const SEARCH_WORD = 'lento';
/** The reading place may drift by this fraction of the book when the layout changes. */
const DRIFT = 0.005;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.epub': 'application/epub+zip',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
};

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const wanted = (arg('--browsers') ?? ALL.join(',')).split(',').map((b) => b.trim()).filter(Boolean);
for (const b of wanted) if (!ALL.includes(b)) throw new Error(`unknown browser: ${b}`);
const outFile = arg('--out') ?? 'reader-e2e.json';

function serve(dist) {
  const roots = [
    ['/books/', join(HERE, 'books')],
    ['/', dist],
  ];
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const [prefix, root] = roots.find(([p]) => path.startsWith(p));
    let file = normalize(join(root, path.slice(prefix.length)));
    if (!file.startsWith(root)) return res.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

const round = (n) => Math.round(n * 10) / 10;
function stats(times) {
  const sorted = [...times].sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return { turns: times.length, median: round(at(0.5)), p95: round(at(0.95)), max: round(sorted.at(-1)) };
}

/** A fresh page with the engine ready, watching page errors and the requests that leave the test server. */
async function openPage(browser, viewport, base) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  const watch = { errors: [], outside: new Map() };
  const outside = (url) => !(url.startsWith(`${base}/`) || /^(blob:|data:|about:)/.test(url));
  page.on('request', (r) => outside(r.url()) && watch.outside.set(r.url(), 'request'));
  page.on('requestfailed', (r) => outside(r.url()) && watch.outside.set(r.url(), r.failure()?.errorText ?? 'failed'));
  page.on('response', (r) => outside(r.url()) && watch.outside.set(r.url(), `response ${r.status()}`));
  page.on('pageerror', (e) => watch.errors.push(String(e).slice(0, 300)));
  await page.goto(`${base}/index.html`);
  await page.waitForFunction(() => window.bk, null, { timeout: 30_000 });
  await page.evaluate(() => window.bk.engine.ready());
  return { context, page, watch };
}

const within = (promise, ms, what) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${what} did not happen within ${ms} ms`)), ms))]);

/** In the page: opens a book (at a fraction of it, if given) and resolves once the first place is shown and quiet. */
const OPEN = async ({ book, fraction, fontSize }) => {
  const { engine, layout, load } = window.bk;
  const file = await load(book);
  const first = new Promise((resolve) => {
    const off = engine.on('relocate', () => {
      off();
      resolve();
    });
  });
  await engine.open(file, book, fraction == null ? null : { fraction }, layout(fontSize));
  await Promise.race([first, new Promise((_, reject) => setTimeout(() => reject(new Error('no place shown after open')), 10_000))]);
  await new Promise((resolve) => setTimeout(resolve, 500));
};

/** In the page: turns pages one by one, each timed from `next()` to its `relocate` and two frames. */
const TURN = async ({ turns, QUIET_MS }) => {
  const { engine } = window.bk;
  const frames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const times = [];
  for (let i = 0; i < turns; i++) {
    const moved = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`page ${i + 1} did not change within 5 s`)), 5000);
      const off = engine.on('relocate', () => {
        off();
        clearTimeout(timer);
        resolve();
      });
    });
    const t0 = performance.now();
    engine.next();
    await moved;
    await frames();
    times.push(performance.now() - t0);
    // foliate-js holds the next turn for 100 ms after each one (and after the move into a new chapter that a turn
    // onto the last page continues with) and drops what comes meanwhile. That hold is not a delay the reader sees,
    // so it stays out of the measure: the next turn waits until the engine has been quiet for a while.
    while (performance.now() - window.bk.state.lastAt < QUIET_MS) await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return times;
};

const last = (page) => page.evaluate(() => window.bk.state.last);

const scenarios = {
  async speed({ page }) {
    await page.evaluate(OPEN, { book: 'grande.epub', fraction: null, fontSize: 18 });
    const s = stats(await page.evaluate(TURN, { turns: TURNS, QUIET_MS }));
    return { ok: s.p95 < BUDGET_MS, ...s, budgetMs: BUDGET_MS };
  },

  async position({ page, viewport }) {
    await page.evaluate(OPEN, { book: 'grande.epub', fraction: 0.4, fontSize: 18 });
    const before = await last(page);
    const checks = [];
    const compare = async (what) => {
      await page.waitForTimeout(1500);
      const now = await last(page);
      const drift = Math.abs(now.fraction - before.fraction);
      checks.push({ what, fraction: now.fraction, drift, sectionIndex: now.sectionIndex, ok: drift <= DRIFT && now.sectionIndex === before.sectionIndex });
    };
    await page.evaluate(() => window.bk.engine.setLayout(window.bk.layout(22)));
    await compare('font size 22');
    await page.setViewportSize({ width: viewport.narrower, height: viewport.height });
    await compare(`width ${viewport.narrower}`);
    return { ok: checks.every((c) => c.ok), before: { fraction: before.fraction, sectionIndex: before.sectionIndex }, maxDrift: DRIFT, checks };
  },

  async search({ page }) {
    await page.evaluate(OPEN, { book: 'grande.epub', fraction: null, fontSize: 18 });
    const searched = page.evaluate(
      async (word) => {
        let results = 0;
        let done = false;
        const finished = window.bk.engine
          .search(word, () => results++, () => undefined)
          .then(() => {
            done = true;
          });
        window.bk.search = { finished, count: () => results, isDone: () => done };
      },
      SEARCH_WORD,
    );
    await searched;
    const times = await page.evaluate(TURN, { turns: SEARCH_TURNS, QUIET_MS });
    const outcome = await page.evaluate(async () => {
      await Promise.race([window.bk.search.finished, new Promise((resolve) => setTimeout(resolve, 60_000))]);
      return { results: window.bk.search.count(), done: window.bk.search.isDone() };
    });
    const s = stats(times);
    return { ok: s.p95 < BUDGET_MS && outcome.results > 0 && outcome.done, ...s, ...outcome, budgetMs: BUDGET_MS, word: SEARCH_WORD };
  },

  async hostile({ page, watch }) {
    await page.evaluate(OPEN, { book: 'ostile.epub', fraction: null, fontSize: 18 });
    await page.waitForTimeout(1000);
    // The chapter's inline handlers would run on these events if the policy did not reach its frame.
    for (const frame of page.frames()) {
      await frame
        .evaluate(() => {
          document.querySelector('p')?.click();
          document.querySelector('div')?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        })
        .catch(() => undefined);
    }
    await page.waitForTimeout(500);
    const ran = [];
    for (const frame of page.frames()) {
      const flag = await frame.evaluate(() => window.__bkScriptRan ?? null).catch(() => null);
      if (flag) ran.push(`${frame.url().slice(0, 40)}: ${flag}`);
    }
    // A request the policy blocked is told apart by the text of its failure, as in the trial this test replaced.
    const requests = [...watch.outside].map(([url, outcome]) => ({ url, outcome, blocked: /csp|content security|blocked/i.test(outcome) }));
    const gone = requests.filter((r) => !r.blocked);
    return { ok: ran.length === 0 && gone.length === 0, scriptsRan: ran, frames: page.frames().length, outsideRequests: requests, outsideNotBlocked: gone.length };
  },

  async close({ page, watch }) {
    await page.evaluate(OPEN, { book: 'grande.epub', fraction: null, fontSize: 18 });
    await page.evaluate(TURN, { turns: 3, QUIET_MS });
    watch.errors.length = 0;
    await page.evaluate(() => window.bk.engine.close());
    await page.waitForTimeout(1500);
    return { ok: watch.errors.length === 0, errors: [...watch.errors] };
  },
};

console.log(`building the test page…`);
const dist = mkdtempSync(join(tmpdir(), 'reader-e2e-'));
await build({
  configFile: join(HERE, 'harness/vite.config.ts'),
  logLevel: 'warn',
  // The config imports the package's TypeScript source, which the runner loads and plain Node cannot.
  configLoader: 'runner',
  // Relative to the page's folder: foliateAssets() joins the output folder to the root, so an absolute one would not do.
  build: { outDir: relative(join(HERE, 'harness'), dist), emptyOutDir: true },
});
const server = await serve(dist);
const base = `http://127.0.0.1:${server.address().port}`;
const types = createRequire(import.meta.url)('playwright');

const results = [];
try {
  for (const engine of wanted) {
    let browser;
    try {
      browser = await types[engine].launch();
    } catch (e) {
      results.push({ engine, scenario: 'launch', ok: false, error: String(e).split('\n')[0] });
      continue;
    }
    for (const viewport of VIEWPORTS) {
      for (const [scenario, run] of Object.entries(scenarios)) {
        const started = Date.now();
        let entry;
        let session;
        try {
          session = await openPage(browser, viewport, base);
          entry = await within(run({ ...session, viewport }), 240_000, scenario);
        } catch (e) {
          entry = { ok: false, error: String(e?.message ?? e).split('\n')[0] };
        } finally {
          await session?.context.close().catch(() => undefined);
        }
        const record = { engine, version: browser.version(), viewport: `${viewport.name} ${viewport.width}x${viewport.height}`, scenario, ...entry, tookMs: Date.now() - started };
        results.push(record);
        const detail = record.p95 != null ? ` p95 ${record.p95} ms (median ${record.median}, max ${record.max})` : '';
        console.log(`${record.ok ? 'ok  ' : 'FAIL'} ${engine} ${record.viewport} ${scenario}${detail}${record.error ? `: ${record.error}` : ''}`);
      }
    }
    await browser.close();
  }
} finally {
  server.close();
  rmSync(dist, { recursive: true, force: true });
}

writeFileSync(outFile, JSON.stringify(results, null, 2) + '\n');
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length} of ${results.length} passed; results in ${outFile}`);
process.exit(failed.length ? 1 : 0);
