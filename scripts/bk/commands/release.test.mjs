import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { git, okRules, repo, runBk, serve, workflowCalls } from './_testkit.mjs';

const PUBLISHED = { '/stable/latest.json': { version: '2.1.0' }, '/beta/latest.json': { version: '2.1.0' } };
const noRelease = { match: ['release', 'view'], code: 1, stderr: 'release not found' };
const releaseUrl = { match: ['release', 'view', '--json', 'url'], stdout: { url: 'https://gh.test/rel/v2.1.1' } };

function withChangelog(dir, text) {
  const f = `${dir}/CHANGELOG.md`;
  const t = readFileSync(f, 'utf8');
  writeFileSync(f, t.replace('## [2.1.0]', `${text}\n## [2.1.0]`));
}

test('release outside main stops', async () => {
  const { dir } = repo('work');
  const r = await runBk(['release', 'patch'], { scenario: okRules([noRelease]), cwd: dir });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /ramo main/);
  assert.equal(workflowCalls(r).length, 0);
});

test('release stops when the tree has changes other than CHANGELOG.md', async () => {
  const { dir } = repo();
  writeFileSync(`${dir}/Cargo.toml`, `${readFileSync(`${dir}/Cargo.toml`, 'utf8')}\n# x\n`);
  const r = await runBk(['release', 'patch'], { scenario: okRules([noRelease]), cwd: dir });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /modifiche non salvate/);
});

test('release stops when the version is not newer than the current one', async () => {
  const { dir } = repo();
  const r = await runBk(['release', '2.0.5'], { scenario: okRules([noRelease]), cwd: dir });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /non è più alta/);
});

test('release stops when the version is not newer than a published one', async () => {
  const { dir } = repo();
  const r2 = await serve({ '/stable/latest.json': { version: '2.1.1' }, '/beta/latest.json': { version: '2.1.0' } });
  try {
    const r = await runBk(['release', 'patch'], { scenario: okRules([noRelease]), cwd: dir, env: { BK_UPDATES_BASE: r2.base } });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /canale stable/);
  } finally {
    r2.close();
  }
});

test('release stops when gh release view succeeds, changing nothing', async () => {
  const { dir } = repo();
  const r2 = await serve(PUBLISHED);
  try {
    const r = await runBk(['release', 'patch'], { scenario: okRules([{ match: ['release', 'view', 'v2.1.1'], stdout: '{}' }]), cwd: dir, env: { BK_UPDATES_BASE: r2.base } });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /La release v2\.1\.1 esiste già su GitHub/);
    assert.match(r.stderr, /npm run bk -- ci/);
    assert.equal(git(dir, 'status', '--porcelain').stdout, '');
    assert.equal(workflowCalls(r).length, 0);
  } finally {
    r2.close();
  }
});

test('release adds the CHANGELOG section and stops without a commit', async () => {
  const { dir } = repo();
  const r2 = await serve(PUBLISHED);
  try {
    const r = await runBk(['release', 'patch'], { scenario: okRules([noRelease]), cwd: dir, env: { BK_UPDATES_BASE: r2.base } });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Ho aggiunto la sezione 2\.1\.1 in CHANGELOG\.md: scrivi le novità, poi rilancia npm run bk -- release 2\.1\.1/);
    assert.match(readFileSync(`${dir}/CHANGELOG.md`, 'utf8'), /## \[2\.1\.1\]/);
    assert.equal(git(dir, 'status', '--porcelain').stdout.trim(), 'M CHANGELOG.md');
    assert.equal(git(dir, 'log', '--oneline').stdout.trim().split('\n').length, 1);
    assert.match(readFileSync(`${dir}/Cargo.toml`, 'utf8'), /version = "2\.1\.0"/);
    assert.equal(workflowCalls(r).length, 0);
  } finally {
    r2.close();
  }
});

test('release with an empty CHANGELOG section errors', async () => {
  const { dir } = repo();
  withChangelog(dir, '## [2.1.1] - 2026-11-28\n\n### Added\n\n-\n');
  const r2 = await serve(PUBLISHED);
  try {
    const r = await runBk(['release', '2.1.1'], { scenario: okRules([noRelease]), cwd: dir, env: { BK_UPDATES_BASE: r2.base } });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /vuota/);
    assert.equal(workflowCalls(r).length, 0);
  } finally {
    r2.close();
  }
});

test('a full release commits, pushes, publishes and verifies the channel', async () => {
  const { dir, remote } = repo();
  withChangelog(dir, '## [2.1.1] - 2026-11-28\n\n### Fixed\n\n- Corretto un errore.\n');
  // The pre-check reads each channel once; afterwards the new version is live.
  const r2 = await serve({
    '/stable/latest.json': (_q, n) => [200, { version: n < 2 ? '2.1.0' : '2.1.1' }],
    '/beta/latest.json': { version: '2.1.0' },
  });
  try {
    const r = await runBk(['release', 'patch'], { scenario: okRules([releaseUrl, noRelease]), cwd: dir, env: { BK_UPDATES_BASE: r2.base } });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.deepEqual(workflowCalls(r), [['workflow', 'run', 'release.yml', '--ref', 'main', '-f', 'publish=true']]);
    assert.equal(git(dir, 'log', '-1', '--pretty=%s').stdout.trim(), 'Release 2.1.1');
    const files = git(dir, 'show', '--name-only', '--pretty=', 'HEAD').stdout.trim().split('\n');
    for (const f of ['Cargo.toml', 'Cargo.lock', 'CHANGELOG.md', 'package-lock.json', 'apps/desktop/src-tauri/tauri.conf.json', 'packages/api/openapi.json', 'apps/mobile/package.json']) {
      assert.ok(files.includes(f), `${f} in commit`);
    }
    assert.equal(git(dir, 'status', '--porcelain').stdout, '');
    assert.equal(git(remote, 'log', '-1', '--pretty=%s', 'main').stdout.trim(), 'Release 2.1.1');
    assert.match(r.stdout, /https:\/\/gh\.test\/rel\/v2\.1\.1/);
  } finally {
    r2.close();
  }
});

test('a failed publish run reports the run URL and the logs hint', async () => {
  const { dir } = repo();
  withChangelog(dir, '## [2.1.1] - 2026-11-28\n\n- Novità.\n');
  const r2 = await serve(PUBLISHED);
  try {
    const r = await runBk(['release', 'patch'], { scenario: okRules([{ match: ['run', 'watch'], code: 1 }, noRelease]), cwd: dir, env: { BK_UPDATES_BASE: r2.base } });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /https:\/\/gh\.test\/run\/7/);
    assert.match(r.stderr, /npm run bk -- ci logs 7/);
  } finally {
    r2.close();
  }
});
