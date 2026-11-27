import test from 'node:test';
import assert from 'node:assert/strict';
import { okRules, repo, runBk, serve, workflowCalls } from './_testkit.mjs';

const hasVarSet = (r) => r.calls().some((a) => a[0] === 'variable' && a[1] === 'set');

// R2 and VPS servers that pass `ready`; the VPS starts answering 302 after its first stable request.
async function world({ beta = true, redirect = true } = {}) {
  let r2;
  const r2s = await serve({
    '/stable/latest.json': () => [200, { version: '2.1.0', platforms: { 'linux-x86_64': { url: `${r2.base}/f.bin` } } }],
    ...(beta ? { '/beta/latest.json': { version: '2.1.0' } } : {}),
    '/f.bin': () => [200, 'x'],
  });
  r2 = r2s;
  const vps = await serve({
    '/stable/latest.json': (_q, n) => (n > 1 && redirect ? [302, '', { location: `${r2.base}/stable/latest.json` }] : [404, '']),
  });
  return { r2, vps, env: { BK_UPDATES_BASE: r2.base, BK_VPS_BASE: vps.base }, close: () => (r2.close(), vps.close()) };
}

test('updates shows channels, source and the redirect state', async () => {
  const w = await world();
  try {
    const { dir } = repo();
    const r = await runBk(['updates'], { scenario: [{ match: ['variable', 'get'], stdout: 'on\n' }], cwd: dir, env: w.env });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /stable: 2\.1\.0/);
    assert.match(r.stdout, /fonte:\s+r2/);
    assert.match(r.stdout, /UPDATES_REDIRECT\): on/);
    assert.deepEqual(r.calls(), [['variable', 'get', 'UPDATES_REDIRECT']]);
  } finally {
    w.close();
  }
});

test('updates seed confirms, then runs updates.yml action=seed', async () => {
  const { dir } = repo();
  let r = await runBk(['updates', 'seed'], { scenario: okRules(), cwd: dir, input: 'n\n' });
  assert.equal(workflowCalls(r).length, 0);
  r = await runBk(['updates', 'seed'], { scenario: okRules(), cwd: dir, input: 's\n' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(workflowCalls(r), [['workflow', 'run', 'updates.yml', '--ref', 'main', '-f', 'action=seed']]);
});

test('withdraw without the word ritira starts nothing', async () => {
  const { dir } = repo();
  const r = await runBk(['updates', 'withdraw', 'beta', '2.2.0-beta.1'], { scenario: okRules(), cwd: dir, input: 's\n' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(workflowCalls(r).length, 0);
});

test('withdraw with the word ritira runs action=withdraw', async () => {
  const w = await world();
  try {
    const { dir } = repo();
    const r = await runBk(['updates', 'withdraw', 'beta', '2.2.0-beta.1'], { scenario: okRules(), cwd: dir, input: 'ritira\n', env: w.env });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(workflowCalls(r), [['workflow', 'run', 'updates.yml', '--ref', 'main', '-f', 'action=withdraw', '-f', 'channel=beta', '-f', 'version=2.2.0-beta.1']]);
    assert.match(r.stdout, /beta:\s+2\.1\.0/);
  } finally {
    w.close();
  }
});

test('switch with R2 missing the beta channel touches neither the variable nor the VPS', async () => {
  const w = await world({ beta: false });
  try {
    const { dir } = repo();
    const r = await runBk(['updates', 'switch'], { scenario: okRules(), cwd: dir, input: 'deploy\n', env: w.env });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /R2 non è pronto: il rimando resta spento/);
    assert.match(r.stderr, /beta/);
    assert.equal(r.calls().length, 0);
  } finally {
    w.close();
  }
});

test('switch without the word deploy changes nothing', async () => {
  const w = await world();
  try {
    const { dir } = repo();
    const r = await runBk(['updates', 'switch'], { scenario: okRules(), cwd: dir, input: 'si\n', env: w.env });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.calls().length, 0);
  } finally {
    w.close();
  }
});

test('switch on sets the variable, deploys caddy and checks the 302', async () => {
  const w = await world();
  try {
    const { dir } = repo();
    const r = await runBk(['updates', 'switch'], { scenario: okRules(), cwd: dir, input: 'deploy\n', env: w.env });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const calls = r.calls();
    assert.deepEqual(calls[0], ['variable', 'set', 'UPDATES_REDIRECT', '--body', 'on']);
    assert.deepEqual(workflowCalls(r), [['workflow', 'run', 'vps-deploy.yml', '--ref', 'main', '-f', 'target=caddy']]);
    assert.match(r.stdout, /Rimando acceso/);
  } finally {
    w.close();
  }
});

test('switch on fails when the VPS does not redirect', async () => {
  const w = await world({ redirect: false });
  try {
    const { dir } = repo();
    const r = await runBk(['updates', 'switch'], { scenario: okRules(), cwd: dir, input: 'deploy\n', env: w.env });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /non rimanda a R2/);
  } finally {
    w.close();
  }
});

test('switch on turns the variable back off when the deploy fails', async () => {
  const w = await world();
  try {
    const { dir } = repo();
    const r = await runBk(['updates', 'switch'], { scenario: okRules([{ match: ['run', 'watch'], code: 1 }]), cwd: dir, input: 'deploy\n', env: w.env });
    assert.equal(r.status, 1);
    const sets = r.calls().filter((a) => a[0] === 'variable').map((a) => a[4]);
    assert.deepEqual(sets, ['on', 'off']);
    assert.match(r.stderr, /rimesso il rimando a off/);
  } finally {
    w.close();
  }
});

test('switch on turns the variable back off when gh workflow run itself fails', async () => {
  const w = await world();
  try {
    const { dir } = repo();
    const r = await runBk(['updates', 'switch'], { scenario: okRules([{ match: ['workflow', 'run'], code: 1, stderr: 'HTTP 422' }]), cwd: dir, input: 'deploy\n', env: w.env });
    assert.equal(r.status, 1);
    const sets = r.calls().filter((a) => a[0] === 'variable').map((a) => a[4]);
    assert.deepEqual(sets, ['on', 'off']);
  } finally {
    w.close();
  }
});

test('switch --off needs the word deploy, then sets off, deploys and checks 200', async () => {
  const vps = await serve({ '/stable/latest.json': { version: '2.1.0' } });
  try {
    const { dir } = repo();
    let r = await runBk(['updates', 'switch', '--off'], { scenario: okRules(), cwd: dir, input: 'no\n', env: { BK_VPS_BASE: vps.base } });
    assert.equal(r.calls().length, 0);
    r = await runBk(['updates', 'switch', '--off'], { scenario: okRules(), cwd: dir, input: 'deploy\n', env: { BK_VPS_BASE: vps.base } });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.calls()[0], ['variable', 'set', 'UPDATES_REDIRECT', '--body', 'off']);
    assert.deepEqual(workflowCalls(r), [['workflow', 'run', 'vps-deploy.yml', '--ref', 'main', '-f', 'target=caddy']]);
    assert.match(r.stdout, /risponde 200/);
    assert.equal(hasVarSet(r), true);
  } finally {
    vps.close();
  }
});
