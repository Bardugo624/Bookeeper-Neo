import test from 'node:test';
import assert from 'node:assert/strict';
import { okRules, repo, runBk, serve, workflowCalls } from './_testkit.mjs';
import { readFileSync } from 'node:fs';

test('deploy outside main stops', async () => {
  const { dir } = repo('work');
  const r = await runBk(['deploy', 'caddy'], { scenario: okRules(), cwd: dir, input: 'deploy\n' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /ramo main/);
  assert.equal(workflowCalls(r).length, 0);
});

test('deploy without the word deploy starts nothing', async () => {
  const { dir } = repo();
  for (const input of ['', 's\n', 'si\n', 'DEPLOY\n']) {
    const r = await runBk(['deploy', 'server'], { scenario: okRules(), cwd: dir, input });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(workflowCalls(r).length, 0);
  }
  const r = await runBk(['deploy', 'server', '--yes'], { scenario: okRules(), cwd: dir });
  assert.equal(workflowCalls(r).length, 0);
});

test('deploy caddy runs vps-deploy.yml and checks the manifest', async () => {
  const { dir } = repo();
  const vps = await serve({ '/stable/latest.json': { version: '2.1.0' } });
  try {
    const r = await runBk(['deploy', 'caddy'], { scenario: okRules(), cwd: dir, input: 'deploy\n', env: { BK_VPS_BASE: vps.base } });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(workflowCalls(r), [['workflow', 'run', 'vps-deploy.yml', '--ref', 'main', '-f', 'target=caddy']]);
    assert.match(r.stdout, /risponde 200/);
  } finally {
    vps.close();
  }
});

test('deploy server waits for the repository version', async () => {
  const { dir } = repo();
  const v = readFileSync(`${dir}/Cargo.toml`, 'utf8').match(/^version = "([^"]+)"/m)[1];
  const srv = await serve({ '/s': (_q, n) => [200, { version: n < 3 ? '0.0.1' : v }] });
  try {
    const r = await runBk(['deploy', 'server'], { scenario: okRules(), cwd: dir, input: 'deploy\n', env: { BK_SERVER_URL: `${srv.base}/s` } });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(workflowCalls(r), [['workflow', 'run', 'vps-deploy.yml', '--ref', 'main', '-f', 'target=server']]);
    assert.match(r.stdout, new RegExp(`versione ${v.replaceAll('.', '\\.')}`));
  } finally {
    srv.close();
  }
});

test('deploy server fails when the version never matches', async () => {
  const { dir } = repo();
  const srv = await serve({ '/s': { version: '0.0.1' } });
  try {
    const r = await runBk(['deploy', 'server'], { scenario: okRules(), cwd: dir, input: 'deploy\n', env: { BK_SERVER_URL: `${srv.base}/s`, BK_POLL_TIMEOUT_MS: '300' } });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /non risponde con la versione/);
  } finally {
    srv.close();
  }
});
