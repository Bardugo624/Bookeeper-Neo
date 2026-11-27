// Generates packages/ui/src/quote/quotes.json from the reviewed quotes in docs/citazioni.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DISCARD = 'scarta';
const LANGS = ['it', 'en'];

const here = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(here, '..');

/** Author names that differ from the `author` field, per interface language. */
export const AUTHORS = {
  'plinio-il-vecchio-1': { it: 'Plinio il Vecchio', en: 'Pliny the Elder' },
  'marco-tullio-cicerone-1': { it: 'Marco Tullio Cicerone', en: 'Cicero' },
  'quinto-orazio-flacco-1': { it: 'Quinto Orazio Flacco', en: 'Horace' },
  'rene-descartes-1': { it: 'Cartesio', en: 'René Descartes' },
  'jean-paul-1': { it: 'Jean Paul', en: 'Jean Paul' },
};

/** Published titles that the `work` field does not give; null means the caption shows the author only. */
export const WORKS = {
  'samuel-johnson-1': null,
  'samuel-johnson-2': null,
  'john-keats-1': null,
  'plinio-il-vecchio-1': null,
  'stephane-mallarme-1': null,
  'w-somerset-maugham-1': null,
  'dante-alighieri-2': 'Divina Commedia',
  'giacomo-leopardi-1': 'Operette morali',
  'francis-bacon-1': 'Essays',
  'helene-hanff-1': '84, Charing Cross Road',
  'augustine-birrell-1': 'Obiter Dicta',
  'charles-lamb-1': 'Last Essays of Elia',
  'w-h-auden-1': "The Dyer's Hand",
  'ralph-waldo-emerson-1': 'Society and Solitude',
  'robert-louis-stevenson-1': 'Virginibus Puerisque',
  'lewis-carroll-1': "Alice's Adventures in Wonderland",
  'charles-dickens-1': 'Our Mutual Friend',
  'montesquieu-1': 'Lettres persanes',
  'marco-tullio-cicerone-1': 'Epistulae ad familiares',
  'quinto-orazio-flacco-1': 'Ars poetica',
};

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

/** The work up to the first « (», in its original language. */
function workTitle(work) {
  const i = work.indexOf(' (');
  return (i === -1 ? work : work.slice(0, i)).trim();
}

const apostrophes = (s) => s.replace(/'/g, '’');

/** The five typographic substitutions, in order. The words stay the source's. */
export function typeset(text) {
  return apostrophes(text)
    .replace(/\.\.\./g, '…')
    .replace(/«/g, '“')
    .replace(/»/g, '”')
    .replace(/ \/ /g, '\n')
    .replace(/ - /g, ' – ')
    .replace(/ -$/gm, ' –');
}

/** Verified in `lang`: high confidence and found again in the source in that language. Quotes marked `scarta` are left out by the caller. */
export function isVerified(quote, lang) {
  return (
    quote.confidence === 'high' &&
    quote.checked?.[lang] === true &&
    typeof quote[lang]?.text === 'string'
  );
}

function entryIn(quote, lang) {
  if (!isVerified(quote, lang)) return null;
  const author = has(AUTHORS, quote.id) ? AUTHORS[quote.id][lang] : quote.author;
  const work = has(WORKS, quote.id) ? WORKS[quote.id] : workTitle(quote.work ?? '');
  return {
    text: typeset(quote[lang].text),
    author: apostrophes(author),
    work: work === null || work === '' ? null : apostrophes(work),
  };
}

/** Pure: verified quotes only, sorted by id. */
export function buildQuotes(quotes, choices) {
  const out = [];
  for (const q of quotes) {
    if (choices[q.id] === DISCARD) continue;
    const [it, en] = LANGS.map((lang) => entryIn(q, lang));
    if (it === null && en === null) continue;
    out.push({ id: q.id, it, en });
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
  out: join(REPO, 'packages/ui/src/quote/quotes.json'),
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generate(DEFAULT_PATHS);
}
