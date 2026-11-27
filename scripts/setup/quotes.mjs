// Generates apps/setup/src/quotes.json from the reviewed quotes in docs/citazioni.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAX_CHARS = 200;
const KEEP = 'tieni';

const here = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(here, '..', '..');

/** The work up to the first « (», in its original language. */
export function workTitle(work) {
  const i = work.indexOf(' (');
  return (i === -1 ? work : work.slice(0, i)).trim();
}

/** Typographic apostrophes and ellipses, as the frontispiece sets them: the words stay the source's. */
export function typeset(text) {
  return text.replace(/'/g, '\u2019').replace(/\.\.\./g, '\u2026');
}

function textIn(quote, lang) {
  const raw = quote[lang]?.text;
  if (typeof raw !== 'string') return null;
  const text = typeset(raw);
  return [...text].length > MAX_CHARS ? null : text;
}

/** Pure: kept quotes only, sorted by id. */
export function buildQuotes(quotes, choices) {
  const out = [];
  for (const q of quotes) {
    if (choices[q.id] !== KEEP) continue;
    const it = textIn(q, 'it');
    const en = textIn(q, 'en');
    if (it === null && en === null) continue;
    out.push({ id: q.id, author: q.author, work: workTitle(q.work), it, en });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function render(quotes, choices) {
  return JSON.stringify(buildQuotes(quotes, choices), null, 2) + '\n';
}

export function generate({ citazioni, scelte, out }) {
  const quotes = JSON.parse(readFileSync(citazioni, 'utf8'));
  const choices = JSON.parse(readFileSync(scelte, 'utf8')).choices ?? {};
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, render(quotes, choices));
}

export const DEFAULT_PATHS = {
  citazioni: join(REPO, 'docs/citazioni/citazioni.json'),
  scelte: join(REPO, 'docs/citazioni/scelte.json'),
  out: join(REPO, 'apps/setup/src/quotes.json'),
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generate(DEFAULT_PATHS);
}
