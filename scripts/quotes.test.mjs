import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  AUTHORS, DEFAULT_PATHS, WORKS, buildQuotes, generate, isVerified, render, typeset,
} from './quotes.mjs';

const q = (id, it, en, extra = {}) => ({
  id,
  author: 'Autore',
  work: 'Opera',
  confidence: 'high',
  it: { text: it },
  en: { text: en },
  checked: { it: true, en: true },
  ...extra,
});

function run(quotes, choices = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'quotes-'));
  const citazioni = join(dir, 'citazioni.json');
  const scelte = join(dir, 'scelte.json');
  const out = join(dir, 'out', 'quotes.json');
  writeFileSync(citazioni, JSON.stringify(quotes));
  writeFileSync(scelte, JSON.stringify({ choices }));
  generate({ citazioni, scelte, out });
  const text = readFileSync(out, 'utf8');
  return { text, data: JSON.parse(text) };
}

const real = JSON.parse(readFileSync(DEFAULT_PATHS.citazioni, 'utf8'));
const choices = JSON.parse(readFileSync(DEFAULT_PATHS.scelte, 'utf8')).choices;
const file = JSON.parse(readFileSync(DEFAULT_PATHS.out, 'utf8'));

test('output is sorted by id, indented by 2 and ends with a newline', () => {
  const { data, text } = run([q('b', 'uno', 'one'), q('a', 'due', 'two')]);
  assert.deepEqual(data.map((x) => x.id), ['a', 'b']);
  assert.deepEqual(Object.keys(data[0]), ['id', 'it', 'en']);
  assert.deepEqual(data[0].it, { text: 'due', author: 'Autore', work: 'Opera' });
  assert.ok(text.startsWith('[\n  {\n    "id"'));
  assert.ok(text.endsWith('}\n]\n'));
});

test('a text verified only in Italian has en: null', () => {
  const { data } = run([q('a', 'uno', 'one', { checked: { it: true, en: false } })]);
  assert.equal(data[0].en, null);
  assert.equal(data[0].it.text, 'uno');
});

test('medium confidence is excluded, and a quote with no language is left out', () => {
  const { data } = run([q('a', 'uno', 'one', { confidence: 'medium' }), q('b', 'due', 'two')]);
  assert.deepEqual(data.map((x) => x.id), ['b']);
  assert.equal(isVerified(q('a', 'x', 'y', { confidence: 'medium' }), 'it'), false);
});

test('scarta excludes a verified quote, and tieni changes nothing', () => {
  const quotes = [q('a', 'uno', 'one'), q('b', 'due', 'two'), q('c', 'tre', 'three')];
  const { data } = run(quotes, { a: 'scarta', b: 'tieni' });
  assert.deepEqual(data.map((x) => x.id), ['b', 'c']);
  assert.deepEqual(buildQuotes(quotes, { b: 'tieni' }), buildQuotes(quotes, {}));
});

test('typeset: each substitution on its own', () => {
  assert.equal(typeset("C'era"), 'C’era');
  assert.equal(typeset('uno...'), 'uno…');
  assert.equal(typeset('«Sto» e «così»'), '“Sto” e “così”');
  assert.equal(typeset('uno / due / tre'), 'uno\ndue\ntre');
  assert.equal(typeset('uno - due'), 'uno – due');
  assert.equal(typeset('uno -'), 'uno –');
  assert.equal(typeset('uno -\ndue'), 'uno –\ndue');
  assert.equal(typeset('nessun cambio, a-b'), 'nessun cambio, a-b');
});

test('typeset: a dash before a verse break becomes a line-end dash', () => {
  assert.equal(typeset('uno - / due'), 'uno –\ndue');
});

test('captions use the five AUTHORS entries', () => {
  assert.deepEqual(Object.keys(AUTHORS).sort(), [
    'jean-paul-1', 'marco-tullio-cicerone-1', 'plinio-il-vecchio-1',
    'quinto-orazio-flacco-1', 'rene-descartes-1',
  ]);
  const expected = {
    'plinio-il-vecchio-1': ['Plinio il Vecchio', 'Pliny the Elder'],
    'marco-tullio-cicerone-1': ['Marco Tullio Cicerone', 'Cicero'],
    'quinto-orazio-flacco-1': ['Quinto Orazio Flacco', 'Horace'],
    'rene-descartes-1': ['Cartesio', 'René Descartes'],
    'jean-paul-1': ['Jean Paul', 'Jean Paul'],
  };
  for (const [id, [it, en]] of Object.entries(expected)) {
    const { data } = run([q(id, 'x', 'y', { author: 'Nome (Name)' })]);
    assert.equal(data[0].it.author, it, id);
    assert.equal(data[0].en.author, en, id);
  }
});

test('WORKS with null gives a caption without a work', () => {
  const { data } = run([q('john-keats-1', 'x', 'y', { work: 'Letter to Shelley, 16 August 1820' })]);
  assert.equal(data[0].it.work, null);
  assert.equal(data[0].en.work, null);
});

test('84, Charing Cross Road stays whole', () => {
  const { data } = run([q('helene-hanff-1', 'x', 'y', { work: '84, Charing Cross Road' })]);
  assert.equal(data[0].it.work, '84, Charing Cross Road');
});

test('the work is cut at the first parenthesis, and captions get apostrophes only', () => {
  const { data } = run([q('a', 'x...', "y' - z", { author: "D'Autore", work: "L'Opera (cap. «1»)" })]);
  assert.equal(data[0].it.work, 'L’Opera');
  assert.equal(data[0].it.author, 'D’Autore');
  assert.equal(data[0].it.text, 'x…');
  assert.equal(data[0].en.text, 'y’ – z');
});

test('every verified work that needs it has a WORKS entry, every author with ( an AUTHORS entry', () => {
  const verified = (x) => ['it', 'en'].some((l) => isVerified(x, l)) && choices[x.id] !== 'scarta';
  for (const x of real.filter(verified)) {
    const title = x.work.split(' (')[0];
    if (/, |: |«/.test(title)) assert.ok(x.id in WORKS, `WORKS misses ${x.id}`);
    if (x.author.includes('(')) assert.ok(x.id in AUTHORS, `AUTHORS misses ${x.id}`);
  }
});

const norm = (s) =>
  s.replace(/[’']/g, "'").replace(/\.\.\.|…/g, '…').replace(/[“”«»]/g, (c) => (c === '“' || c === '«' ? '«' : '»'))
    .replace(/\n| \/ /g, ' / ').replace(/ [-–](?= |\n|$)/g, ' -');

test('the words are the source’s, in every text of the real file', () => {
  const byId = new Map(real.map((x) => [x.id, x]));
  let n = 0;
  for (const entry of file) {
    for (const lang of ['it', 'en']) {
      if (!entry[lang]) continue;
      n++;
      assert.equal(norm(entry[lang].text), norm(byId.get(entry.id)[lang].text), `${entry.id} ${lang}`);
    }
  }
  assert.equal(n, 128);
});

test('the real file has 80 Italian and 48 English texts, all verified', () => {
  assert.equal(file.filter((x) => x.it).length, 80);
  assert.equal(file.filter((x) => x.en).length, 48);
  const byId = new Map(real.map((x) => [x.id, x]));
  for (const entry of file) {
    for (const lang of ['it', 'en']) {
      if (entry[lang]) assert.ok(isVerified(byId.get(entry.id), lang), `${entry.id} ${lang}`);
    }
  }
});

test('the generated file in the repository is up to date', () => {
  assert.equal(readFileSync(DEFAULT_PATHS.out, 'utf8'), render(real, choices));
});
