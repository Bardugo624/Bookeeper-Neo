// The reader engine trial of phase 10B: page turns in a large EPUB, and a hostile EPUB that must stay inert.
import './foliate-js/view.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const TURNS = Number(params.get('pagine') ?? 100);
// A page turn above this is a delay a reader notices.
const SLOW_MS = 100;

const status = (text) => {
  $('status').textContent = text;
};
const paint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const round = (n) => Math.round(n * 10) / 10;

async function fetchBook(name) {
  const res = await fetch(`libri/${name}`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return new File([await res.blob()], name, { type: 'application/epub+zip' });
}

/** The next `relocate` of `view`, or an error after 5 s: a page that never shows is a failure, not a wait. */
function relocation(view) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('la pagina non è cambiata entro 5 s')), 5000);
    view.addEventListener('relocate', () => resolve(clearTimeout(timer)), { once: true });
  });
}

function newView() {
  const view = document.createElement('foliate-view');
  $('stage').replaceChildren(view);
  return view;
}

async function largeBook(result) {
  status('Apro il libro grande…');
  const start = performance.now();
  const view = newView();
  const first = relocation(view);
  await view.open(await fetchBook('grande.epub'));
  const shown = view.renderer.next();
  await first;
  await paint();
  result.aperturaMs = Math.round(performance.now() - start);
  await shown;

  // A turn lasts until the new page is painted. foliate-js then holds the next turn for 100 ms on purpose:
  // that wait is not a delay the reader sees, so it stays out of the measure.
  const times = [];
  for (let i = 0; i < TURNS; i++) {
    if (i % 10 === 0) status(`Giro le pagine: ${i} di ${TURNS}…`);
    const moved = relocation(view);
    const t0 = performance.now();
    const turned = view.next();
    await moved;
    await paint();
    times.push(performance.now() - t0);
    await turned;
  }
  const sorted = [...times].sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  result.pagina = {
    mediana: round(at(0.5)),
    p95: round(at(0.95)),
    massimo: round(sorted[sorted.length - 1]),
    media: round(times.reduce((s, t) => s + t, 0) / times.length),
    lente: times.filter((t) => t > SLOW_MS).length,
  };
  const where = view.lastLocation;
  result.arrivo = {
    capitolo: (where?.section?.current ?? 0) + 1,
    capitoli: where?.section?.total ?? null,
    percentuale: where?.fraction != null ? round(where.fraction * 100) : null,
  };
  view.close();
}

async function hostileBook(result) {
  status('Apro il libro ostile…');
  delete window.__bkScriptRan;
  const violations = [];
  let doc = null;
  const view = newView();
  view.addEventListener('load', (e) => {
    doc = e.detail.doc;
    doc.addEventListener('securitypolicyviolation', (v) => violations.push(v.violatedDirective));
  });
  await view.open(await fetchBook('ostile.epub'));
  await view.renderer.next();
  await paint();
  await wait(800);
  // The chapter's inline handlers would run on these events if the policy did not reach its frame;
  // with the policy there, each one is a violation reported inside the frame.
  doc?.querySelector('p')?.click();
  doc?.querySelector('div')?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  await wait(300);
  result.recinto = {
    codiceEseguito: window.__bkScriptRan ?? null,
    violazioniNelLibro: violations.length,
  };
  view.close();
}

function show(result) {
  const ua = navigator.userAgent;
  const engine = /Firefox\//.test(ua) ? 'Firefox (Gecko)' : /Chrome\//.test(ua) ? 'Chromium (Blink)' : /AppleWebKit\//.test(ua) ? 'WebKit' : ua;
  const p = result.pagina;
  const r = result.recinto;
  const rows = [
    ['Motore', engine],
    ['Schermo', result.schermo],
    ['Apertura del libro grande', result.aperturaMs != null ? `${result.aperturaMs} ms` : '—'],
    ['Pagina, mediana', p ? `${p.mediana} ms` : '—'],
    ['Pagina, 95° percentile', p ? `${p.p95} ms` : '—'],
    ['Pagina, la più lenta', p ? `${p.massimo} ms` : '—'],
    [`Pagine oltre ${SLOW_MS} ms`, p ? `${p.lente} su ${result.pagine}` : '—', p && p.lente === 0],
    ['Arrivo', result.arrivo ? `capitolo ${result.arrivo.capitolo} di ${result.arrivo.capitoli}` : '—'],
    ['Codice del libro eseguito', r ? (r.codiceEseguito ? `Sì (${r.codiceEseguito})` : 'No') : '—', r && !r.codiceEseguito],
    ['La regola di sicurezza vale nel libro', r ? (r.violazioniNelLibro > 0 ? `Sì (${r.violazioniNelLibro} blocchi)` : 'Non visto') : '—', r && r.violazioniNelLibro > 0],
    ['Errori', result.errori.length ? result.errori.join('; ') : 'Nessuno', result.errori.length === 0],
  ];
  const body = $('results').tBodies[0];
  body.replaceChildren(
    ...rows.map(([label, value, good]) => {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      const td = document.createElement('td');
      th.textContent = label;
      td.textContent = value;
      if (good === true) td.className = 'ok';
      if (good === false) td.className = 'bad';
      tr.append(th, td);
      return tr;
    }),
  );
  $('results').hidden = false;
  $('copy').hidden = false;
}

async function run() {
  $('start').disabled = true;
  const result = { userAgent: navigator.userAgent, schermo: `${innerWidth}×${innerHeight}`, pagine: TURNS, errori: [] };
  try {
    await largeBook(result);
  } catch (e) {
    result.errori.push(`libro grande: ${e?.message ?? e}`);
  }
  try {
    await hostileBook(result);
  } catch (e) {
    result.errori.push(`libro ostile: ${e?.message ?? e}`);
  }
  window.__trialResult = result;
  show(result);
  status('Prova finita.');
  $('start').disabled = false;
}

$('start').addEventListener('click', run);
$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(JSON.stringify(window.__trialResult, null, 2));
    status('Risultati copiati.');
  } catch {
    status('Non riesco a copiare: fai uno screenshot della tabella.');
  }
});
if (params.has('auto')) run();
