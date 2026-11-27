import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DEFAULT_PATHS, generate, render, typeset } from './quotes.mjs';

const q = (id, it, en, work = 'Opera') => ({
  id, author: 'Autore', work, it: { text: it }, en: { text: en },
});

function run(quotes, choices) {
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

test('keeps only quotes chosen as tieni, sorted by id', () => {
  const { data, text } = run(
    [q('b', 'uno', 'one'), q('a', 'due', 'two'), q('c', 'tre', 'three')],
    { a: 'tieni', b: 'tieni', c: 'scarta' },
  );
  assert.deepEqual(data.map((x) => x.id), ['a', 'b']);
  assert.deepEqual(Object.keys(data[0]), ['id', 'author', 'work', 'it', 'en']);
  assert.ok(text.endsWith('}\n]\n'));
});

test('cuts the work at the first parenthesis', () => {
  const { data } = run([q('a', 'x', 'y', 'Cuore (chapter «La libreria»)')], { a: 'tieni' });
  assert.equal(data[0].work, 'Cuore');
});

test('drops a language over 200 characters, and the quote if both are', () => {
  const long = 'x'.repeat(201);
  const ok = 'y'.repeat(200);
  const { data } = run(
    [q('a', long, 'short'), q('b', long, long), q('c', ok, ok)],
    { a: 'tieni', b: 'tieni', c: 'tieni' },
  );
  assert.deepEqual(data.map((x) => x.id), ['a', 'c']);
  assert.equal(data[0].it, null);
  assert.equal(data[0].en, 'short');
  assert.equal(data[1].it, ok);
});

test('sets apostrophes and ellipses typographically', () => {
  assert.equal(typeset("C'era una volta... un re"), 'C\u2019era una volta\u2026 un re');
  assert.equal(typeset('nessun cambio'), 'nessun cambio');
});

test('the generated file in the repository is up to date', () => {
  const quotes = JSON.parse(readFileSync(DEFAULT_PATHS.citazioni, 'utf8'));
  const choices = JSON.parse(readFileSync(DEFAULT_PATHS.scelte, 'utf8')).choices;
  assert.equal(readFileSync(DEFAULT_PATHS.out, 'utf8'), render(quotes, choices));
});
