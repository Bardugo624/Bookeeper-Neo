import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readVersion, bumpVersion, ensureChangelog } from './version.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FILES = [
  'Cargo.toml',
  'Cargo.lock',
  'CHANGELOG.md',
  'package-lock.json',
  'apps/desktop/src-tauri/tauri.conf.json',
  'packages/api/openapi.json',
  ...['packages/ui', 'packages/api', 'packages/i18n', 'packages/reader', 'apps/desktop', 'apps/mobile', 'apps/setup'].map((p) => `${p}/package.json`),
];

function copyRepo(crlf = false) {
  const tmp = mkdtempSync(join(tmpdir(), 'bk-version-'));
  for (const f of FILES) {
    mkdirSync(dirname(join(tmp, f)), { recursive: true });
    if (crlf) writeFileSync(join(tmp, f), readFileSync(join(REPO, f), 'utf8').replace(/\r?\n/g, '\r\n'));
    else copyFileSync(join(REPO, f), join(tmp, f));
  }
  return tmp;
}
const read = (d, f) => readFileSync(join(d, f), 'utf8');
const lines = (s) => s.split(/\r?\n/);

test('bumpVersion cambia ogni posto e solo le righe con la versione di partenza', () => {
  const tmp = copyRepo();
  try {
    const from = readVersion(tmp);
    const before = Object.fromEntries(FILES.map((f) => [f, read(tmp, f)]));
    const changed = bumpVersion(tmp, '9.9.9');
    assert.ok(changed.includes('Cargo.toml') && changed.includes('Cargo.lock'));
    assert.ok(changed.includes('package-lock.json') && changed.includes('packages/api/openapi.json'));
    assert.equal(changed.length, 12);
    assert.equal(readVersion(tmp), '9.9.9');
    for (const f of FILES.filter((x) => x !== 'CHANGELOG.md')) {
      const a = lines(before[f]);
      const b = lines(read(tmp, f));
      assert.equal(a.length, b.length);
      a.forEach((l, i) => {
        if (l !== b[i]) assert.ok(l.includes(`"${from}"`), `${f}:${i + 1}`);
      });
    }
    for (const f of FILES.filter((x) => x.endsWith('.json'))) {
      const j = JSON.parse(read(tmp, f));
      if (f.endsWith('openapi.json')) assert.equal(j.info.version, '9.9.9');
      else if (f === 'package-lock.json') {
        for (const p of ['ui', 'api', 'i18n']) assert.equal(j.packages[`packages/${p}`].version, '9.9.9');
        for (const p of ['desktop', 'mobile', 'setup']) assert.equal(j.packages[`apps/${p}`].version, '9.9.9');
        assert.equal(j.packages['node_modules/brace-expansion'].version, '2.1.0');
      } else assert.equal(j.version, '9.9.9');
    }
    const lock = read(tmp, 'Cargo.lock');
    assert.match(lock, /name = "async-net"\nversion = "2\.0\.0"\nsource/);
    for (const c of ['core', 'desktop', 'net', 'server']) {
      assert.match(lock, new RegExp(`name = "bookeeper-${c}"\\nversion = "9\\.9\\.9"`));
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('bumpVersion conserva i \\r\\n', () => {
  const tmp = copyRepo(true);
  try {
    bumpVersion(tmp, '9.9.9');
    for (const f of FILES.filter((x) => x !== 'CHANGELOG.md')) {
      const t = read(tmp, f);
      assert.ok(!/[^\r]\n/.test(t), `${f} ha perso un \\r\\n`);
      assert.ok(t.includes('9.9.9'));
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('un posto in disaccordo ferma tutto senza scrivere', () => {
  const tmp = copyRepo();
  try {
    const f = 'apps/desktop/src-tauri/tauri.conf.json';
    const p = join(tmp, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/"version": "[^"]*"/, '"version": "1.0.0"'));
    const before = FILES.map((x) => read(tmp, x));
    assert.throws(() => bumpVersion(tmp, '9.9.9'), (e) => e.message.includes('tauri.conf.json'));
    assert.deepEqual(FILES.map((x) => read(tmp, x)), before);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('ensureChangelog aggiunge la sezione una volta e conserva i \\r\\n', () => {
  for (const crlf of [false, true]) {
    const tmp = copyRepo(crlf);
    try {
      assert.deepEqual(ensureChangelog(tmp, '9.9.9', '2026-12-01'), { existed: false });
      const t = read(tmp, 'CHANGELOG.md');
      const eol = crlf ? '\r\n' : '\n';
      assert.ok(t.includes(`## [9.9.9] - 2026-12-01${eol}${eol}### Added${eol}${eol}-${eol}${eol}## [`));
      assert.ok(t.indexOf('## [9.9.9]') < t.indexOf('## [2.1.0]'));
      if (crlf) assert.ok(!/[^\r]\n/.test(t));
      assert.deepEqual(ensureChangelog(tmp, '9.9.9', '2026-12-01'), { existed: true });
      assert.equal(read(tmp, 'CHANGELOG.md'), t);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
});

test('ensureChangelog riconosce la sezione solo a inizio riga', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'bk-changelog-'));
  try {
    writeFileSync(join(tmp, 'CHANGELOG.md'), '# Changelog\n\nNelle note si cita ## [9.9.9] in mezzo al testo.\n\n## [2.1.0] - 2026-11-27\n');
    assert.deepEqual(ensureChangelog(tmp, '9.9.9', '2026-12-01'), { existed: false });
    assert.match(readFileSync(join(tmp, 'CHANGELOG.md'), 'utf8'), /^## \[9\.9\.9\] - 2026-12-01$/m);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
