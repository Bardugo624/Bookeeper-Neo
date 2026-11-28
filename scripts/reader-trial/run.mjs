// Runs the reader engine trial page (apps/mobile/public/prova-lettore) in every Playwright engine installed,
// at a phone's size, and writes the results. Usage: node scripts/reader-trial/run.mjs [results.json]
// It needs `playwright` and its browsers, which are not dependencies of this repository.
// It fails when the hostile book runs code or reaches the network; page-turn times are reported, not judged.
import { createReadStream, existsSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../apps/mobile/public');
const ENGINES = ['chromium', 'webkit', 'firefox'];
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.epub': 'application/epub+zip',
  '.png': 'image/png',
  '.md': 'text/plain; charset=utf-8',
};

function serve() {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) return res.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

async function trial(engine, browserType, base) {
  let browser;
  try {
    browser = await browserType.launch();
  } catch (e) {
    return { engine, installato: false, motivo: String(e).split('\n')[0] };
  }
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    // What happened to each request off this machine: blocked by the policy, or gone to the network.
    const external = new Map();
    const problems = [];
    const outside = (url) => !/^(https?:\/\/127\.0\.0\.1[:/]|blob:|data:|about:)/.test(url);
    page.on('request', (r) => outside(r.url()) && external.set(r.url(), 'richiesta'));
    page.on('requestfailed', (r) => outside(r.url()) && external.set(r.url(), r.failure()?.errorText ?? 'fallita'));
    page.on('response', (r) => outside(r.url()) && external.set(r.url(), `risposta ${r.status()}`));
    page.on('pageerror', (e) => problems.push(`pageerror: ${String(e).slice(0, 200)}`));
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 200)}`);
    });
    await page.goto(`${base}/prova-lettore/?auto=1`);
    await page.waitForFunction(() => window.__trialResult, null, { timeout: 240_000 });
    const result = await page.evaluate(() => window.__trialResult);
    const requests = [...external].map(([url, esito]) => ({ url, esito, bloccata: /csp|content security|blocked/i.test(esito) }));
    return { engine, installato: true, version: browser.version(), ...result, richiesteEsterne: requests, problemiDellaPagina: problems };
  } finally {
    await browser.close();
  }
}

const out = process.argv[2] ?? 'reader-trial.json';
const { chromium, webkit, firefox } = createRequire(import.meta.url)('playwright');
const types = { chromium, webkit, firefox };
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const results = [];
for (const engine of ENGINES) results.push(await trial(engine, types[engine], base));
server.close();
writeFileSync(out, JSON.stringify(results, null, 2) + '\n');

let failed = false;
for (const r of results) {
  if (!r.installato) {
    console.log(`${r.engine}: non installato`);
    continue;
  }
  const p = r.pagina ?? {};
  const fence = r.recinto ?? {};
  const gone = r.richiesteEsterne.filter((q) => !q.bloccata);
  const unsafe = Boolean(fence.codiceEseguito) || gone.length > 0 || !(fence.violazioniNelLibro > 0);
  if (unsafe || r.errori.length) failed = true;
  console.log(
    `${r.engine} ${r.version}: apertura ${r.aperturaMs} ms; pagina mediana ${p.mediana} ms, p95 ${p.p95} ms, massimo ${p.massimo} ms, ` +
      `${p.lente} lente su ${r.pagine}; arrivo capitolo ${r.arrivo?.capitolo}/${r.arrivo?.capitoli}; ` +
      `codice del libro: ${fence.codiceEseguito ?? 'no'}; blocchi nel libro: ${fence.violazioniNelLibro}; ` +
      `richieste esterne bloccate ${r.richiesteEsterne.length - gone.length}, uscite ${gone.length}${gone.length ? ` (${gone.map((q) => `${q.url}: ${q.esito}`).join(', ')})` : ''}; ` +
      `errori: ${r.errori.length ? r.errori.join(' | ') : 'nessuno'}`,
  );
  for (const p2 of r.problemiDellaPagina) console.log(`  ${p2}`);
}
console.log(`risultati in ${out}`);
process.exit(failed ? 1 : 0);
