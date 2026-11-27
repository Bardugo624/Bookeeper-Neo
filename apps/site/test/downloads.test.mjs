import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, fromGithub, fromIndex, fromManifest, loadRelease, detectSystem, formatSize, notesToHtml } from '../src/downloads.mjs';

const names = [
  'bookeeper-server-2.1.0-linux-amd64.tar.gz',
  'bookeeper-server-2.1.0-linux-arm64.tar.gz',
  'bookeeper-server-2.1.0-macos-amd64.tar.gz',
  'bookeeper-server-2.1.0-macos-arm64.tar.gz',
  'bookeeper-server-2.1.0-windows-amd64.zip',
  'Bookeeper_2.1.0_aarch64.dmg',
  'Bookeeper_2.1.0_amd64.AppImage',
  'Bookeeper_2.1.0_amd64.deb',
  'Bookeeper_2.1.0_x64-setup.exe',
  'Bookeeper_2.1.0_x64.dmg',
  'SHA256SUMS',
];
const release = {
  tag_name: 'v2.1.0',
  published_at: '2026-11-27T03:08:46Z',
  html_url: 'https://github.com/Bardugo624/Bookeeper-Neo/releases/tag/v2.1.0',
  assets: names.map((name, i) => ({ name, size: 1000 + i, browser_download_url: `https://example.test/${name}` })),
};

test('every file of the 2.1.0 release has an id', () => {
  for (const n of names) assert.ok(classify(n), n);
  assert.equal(classify('Bookeeper_2.1.0_x64.dmg'), 'mac-intel');
  assert.equal(classify('Bookeeper_2.1.0_aarch64.dmg'), 'mac-arm');
  assert.equal(classify('latest.json'), null);
});

test('the version comes from the release, not from the page', () => {
  const r = fromGithub({ ...release, tag_name: 'v9.4.2' });
  assert.equal(r.version, '9.4.2');
  assert.equal(r.files.length, names.length);
  assert.deepEqual(r.files.slice(0, 5).map((f) => f.id), ['windows', 'mac-arm', 'mac-intel', 'appimage', 'deb']);
});

test('the R2 index gives the same files as GitHub', () => {
  const index = {
    version: '2.1.0',
    date: '2026-11-27',
    files: names.map((name) => ({ name, url: `https://updates.neokeeper.dev/v2/downloads/2.1.0/${name}`, size: 1 })),
  };
  assert.deepEqual(fromIndex(index).files.map((f) => f.id), fromGithub(release).files.map((f) => f.id));
  const byPlatform = { version: '2.1.0', platforms: { win: { url: 'https://u.test/v2/downloads/2.1.0/Bookeeper_2.1.0_x64-setup.exe' } } };
  assert.equal(fromIndex(byPlatform).files[0].id, 'windows');
});

test('the index is tried first and GitHub answers when it fails', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes('updates.neokeeper.dev')) return { ok: false, status: 404 };
    return { ok: true, json: async () => release };
  };
  const r = await loadRelease(['index', 'github'], fetchImpl, []);
  assert.equal(r.source, 'github');
  assert.equal(calls.length, 2);
});

test('no source answering is an error the page can show', async () => {
  await assert.rejects(loadRelease(['github'], async () => ({ ok: false, status: 403 })));
});

test('the installer billed first follows the visitor system', () => {
  assert.equal(detectSystem('Mozilla/5.0 (Windows NT 10.0; Win64; x64)').primary, 'windows');
  assert.equal(detectSystem('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)').primary, 'mac-arm');
  assert.equal(detectSystem('Mozilla/5.0 (Macintosh)', { platform: 'macOS', architecture: 'x86' }).primary, 'mac-intel');
  assert.equal(detectSystem('Mozilla/5.0 (X11; Linux x86_64)').primary, 'appimage');
  assert.equal(detectSystem('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)').kind, 'phone');
  assert.equal(detectSystem('Mozilla/5.0 (Linux; Android 14)').kind, 'phone');
});

test('sizes read in megabytes', () => {
  assert.equal(formatSize(8213331, 'it'), '7,8 MB');
  assert.equal(formatSize(91847160, 'en'), '88 MB');
});

test('notes come from the first manifest that announces the same version', async () => {
  const r2 = 'https://r2.test/v2/stable/latest.json';
  const vps = '/updates/stable/latest.json';
  const answers = {
    [r2]: null,
    [vps]: { version: '2.1.0', notes: '### Added\n\n- dalla VPS', pub_date: '2026-11-27T03:09:00Z' },
  };
  const fetchImpl = async (url) => {
    if (url in answers) return answers[url] ? { ok: true, json: async () => answers[url] } : { ok: false, status: 404 };
    return { ok: true, json: async () => ({ ...release, body: 'dalla release' }) };
  };
  const r = await loadRelease(['github'], fetchImpl, [r2, vps]);
  assert.equal(r.notes, '### Added\n\n- dalla VPS');
  assert.equal(r.notesSource, vps);
});

test('a manifest for another version does not lend its notes', async () => {
  const fetchImpl = async (url) => url.endsWith('latest.json')
    ? { ok: true, json: async () => ({ version: '2.2.0', notes: 'più nuova' }) }
    : { ok: true, json: async () => ({ ...release, body: 'dalla release' }) };
  const r = await loadRelease(['github'], fetchImpl, ['/updates/stable/latest.json']);
  assert.equal(r.notes, 'dalla release');
});

test('release notes render the changelog subset and nothing else', () => {
  const html = notesToHtml('### Fixed\n\n- **Menu** `x` <img src=x onerror=alert(1)>\n  a capo\n- [ok](https://example.org) [no](javascript:alert(1))', 'it');
  assert.match(html, /<h4>Correzioni<\/h4>/);
  assert.match(html, /<strong>Menu<\/strong> <code>x<\/code> &lt;img/);
  assert.match(html, /a capo<\/li>/);
  assert.match(html, /<a href="https:\/\/example.org">ok<\/a>/);
  assert.doesNotMatch(html, /href="javascript/);
  assert.equal(notesToHtml('### Added', 'en'), '<h4>New</h4>');
});

test('with GitHub refusing, the manifest gives version, notes and the installer links', async () => {
  const manifest = { version: '2.1.0', notes: '### Added\n\n- novità', pub_date: '2026-11-27T03:09:00Z' };
  const fetchImpl = async (url) => {
    if (url.includes('api.github.com')) return { ok: false, status: 403 };
    if (url.includes('stable.json')) return { ok: false, status: 404 };
    if (url === '/updates/stable/latest.json') return { ok: true, json: async () => manifest };
    return { ok: false, status: 502 };
  };
  const r = await loadRelease(['index', 'github', 'manifest'], fetchImpl, ['https://r2.test/latest.json', '/updates/stable/latest.json']);
  assert.equal(r.source, 'manifest');
  assert.equal(r.version, '2.1.0');
  assert.equal(r.notes, manifest.notes);
  // The same names as the real 2.1.0 release, so the links point at real files.
  assert.deepEqual(r.files.map((f) => f.name).sort(), [...names].sort());
  assert.equal(r.files.find((f) => f.id === 'windows').url,
    'https://github.com/Bardugo624/Bookeeper-Neo/releases/download/v2.1.0/Bookeeper_2.1.0_x64-setup.exe');
});

test('a beta manifest never becomes the download source', () => {
  assert.throws(() => fromManifest({ version: '2.2.0-beta.1' }));
});
