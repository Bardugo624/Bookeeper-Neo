import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakeGh } from './fake-gh.mjs';

const bk = join(dirname(fileURLToPath(import.meta.url)), '..', 'bk.mjs');
const tmp = () => mkdtempSync(join(tmpdir(), 'bk-cmd-'));

async function serve(routes) {
  const srv = createServer((req, res) => {
    const body = routes[req.url];
    res.statusCode = body ? 200 : 404;
    res.end(body ? JSON.stringify(body) : '');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() };
}

// Run bk in a child with a fake gh first on PATH (or no gh at all when scenario is null).
// Async on purpose: the local test servers live in this process and must keep answering.
function runBk(args, { scenario, env = {}, cwd } = {}) {
  const dir = tmp();
  const fake = scenario ? installFakeGh(join(dir, 'bin'), scenario) : null;
  const bin = fake ? join(dir, 'bin') : join(dir, 'empty');
  if (!fake) mkdirSync(bin);
  const gitDir = dirname(spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim() || '/usr/bin/git');
  return new Promise((resolve) => {
    {
      const p = spawn(process.execPath, [bk, ...args], {
        cwd,
        env: { ...process.env, ...(fake?.env ?? {}), PATH: [bin, gitDir].join(delimiter), BK_UPDATES_BASE: 'http://127.0.0.1:1', BK_VPS_BASE: 'http://127.0.0.1:1', BK_SERVER_URL: 'http://127.0.0.1:1/x', ...env },
      });
      let stdout = '';
      let stderr = '';
      p.stdout.on('data', (d) => (stdout += d));
      p.stderr.on('data', (d) => (stderr += d));
      p.on('close', (status) => resolve({ status, stdout, stderr, calls: () => fake?.calls() ?? [] }));
    }
  });
}

test('gh missing: Italian message, exit 1, no stack', async () => {
  const r = await runBk(['ci']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /✗ gh non è installato/);
  assert.match(r.stderr, /→ Installa GitHub CLI/);
  assert.doesNotMatch(r.stderr, /\n\s+at /);
});

test('help lists the commands', async () => {
  const r = await runBk(['help']);
  assert.equal(r.status, 0);
  for (const c of ['status', 'ci', 'dist', 'doctor']) assert.match(r.stdout, new RegExp(`\\n  ${c}\\s`));
});

test('status shows version, channels, source and server', async () => {
  const r2 = await serve({ '/stable/latest.json': { version: '2.1.0' }, '/beta/latest.json': { version: '2.2.0-beta.1' } });
  const srv = await serve({ '/server': { version: '2.1.3' } });
  try {
    const r = await runBk(['status'], {
      scenario: [
        { match: ['run', 'list'], stdout: [{ databaseId: 7, status: 'completed', conclusion: 'success', headBranch: 'main', createdAt: '2026-11-27T10:00:00Z' }] },
      ],
      env: { BK_UPDATES_BASE: r2.base, BK_SERVER_URL: `${srv.base}/server` },
    });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Versione: \d+\.\d+\.\d+/);
    assert.match(r.stdout, /stable: 2\.1\.0/);
    assert.match(r.stdout, /beta:\s+2\.2\.0-beta\.1/);
    assert.match(r.stdout, /fonte:\s+R2/);
    assert.match(r.stdout, /Versione: 2\.1\.3/);
    assert.match(r.stdout, /#7 success/);
    const wfs = r.calls().filter((a) => a[0] === 'run').map((a) => a[3]);
    assert.deepEqual(wfs, ['ci.yml', 'release.yml', 'vps-deploy.yml']);
  } finally {
    r2.close();
    srv.close();
  }
});

test('ci run stops when the branch is not on GitHub', async () => {
  const repo = tmp(); // a repository with no remote: nothing is pushed
  for (const a of [['init', '-b', 'work'], ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--allow-empty', '-m', 'x']]) spawnSync('git', a, { cwd: repo });
  const r = await runBk(['ci', 'run'], { scenario: [{ match: [], stdout: '' }], cwd: repo });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Il ramo work non è ancora su GitHub/);
  assert.equal(r.calls().some((a) => a[0] === 'workflow'), false);
});

test('dist uses the download index', async () => {
  const idx = await serve({ '/downloads/stable.json': { version: '2.1.0', date: '2026-11-27', files: { 'Bookeeper_2.1.0_x64.exe': 'https://example.test/a.exe' } } });
  try {
    const r = await runBk(['dist'], { scenario: [{ match: [], code: 99 }], env: { BK_UPDATES_BASE: idx.base } });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /indice dei download/);
    assert.match(r.stdout, /https:\/\/example\.test\/a\.exe/);
    assert.equal(r.calls().length, 0);
  } finally {
    idx.close();
  }
});

test('dist without an index falls back to the release', async () => {
  const r = await runBk(['dist', '2.1.0'], {
    scenario: [{ match: ['release', 'view', 'v2.1.0'], stdout: { assets: [{ name: 'Bookeeper_2.1.0_x64.exe', url: 'https://gh.test/a.exe' }] } }],
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /release su GitHub/);
  assert.match(r.stdout, /https:\/\/gh\.test\/a\.exe/);
});

test('doctor flags a missing gh', async () => {
  const r = await runBk(['doctor']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /✗ gh installato/);
  assert.match(r.stdout, /winget install GitHub\.cli/);
  assert.match(r.stdout, /✓ git installato/);
});
