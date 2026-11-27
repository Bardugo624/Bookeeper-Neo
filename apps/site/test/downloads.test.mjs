import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, fromGithub, fromIndex, loadRelease, detectSystem, formatSize } from '../src/downloads.mjs';

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
  const r = await loadRelease(['index', 'github'], fetchImpl);
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
