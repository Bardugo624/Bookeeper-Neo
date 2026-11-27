import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const menu = pathToFileURL(join(here, 'menu.mjs')).href;
const bk = join(here, '..', 'bk.mjs');

// Run a snippet that uses the menu module with piped input.
function snippet(code, input) {
  const src = `import { choose, confirm, closeMenu } from '${menu}';\n${code}\ncloseMenu();`;
  return spawnSync(process.execPath, ['--input-type=module', '-e', src], { input, encoding: 'utf8' });
}

const items = "[{key:'a',label:'A'},{key:'b',label:'B'},{key:'c',label:'C'}]";

test('choose: input "2" picks the second item', () => {
  const r = snippet(`console.log('KEY=' + await choose('Titolo', ${items}));`, '2\n');
  assert.match(r.stdout, /KEY=b/);
});

test('choose: asks again after an invalid answer', () => {
  const r = snippet(`console.log('KEY=' + await choose('Titolo', ${items}));`, '9\nx\n3\n');
  assert.match(r.stdout, /Numero non valido/);
  assert.match(r.stdout, /KEY=c/);
});

test('confirm: with a word, only that exact word passes', () => {
  const r = snippet(`console.log(await confirm('Sicuro?', 'pubblica'), await confirm('Sicuro?', 'pubblica'));`, 'pubblica\nsi\n');
  assert.match(r.stdout, /true false/);
});

test('bk with no argument shows the menu; end of input fails cleanly', () => {
  const r = spawnSync(process.execPath, [bk], { input: '', encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /1\. ci/);
  assert.match(r.stderr, /Nessuna scelta/);
  assert.doesNotMatch(r.stderr, /\n\s+at /);
});
