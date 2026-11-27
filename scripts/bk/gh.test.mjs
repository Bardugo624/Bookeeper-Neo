import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gh, findRun } from './gh.mjs';
import { BkError } from './errors.mjs';
import { installFakeGh } from './fake-gh.mjs';

const work = () => mkdtempSync(join(tmpdir(), 'bk-gh-'));

function withEnv(env, fn) {
  const saved = {};
  for (const k of Object.keys(env)) saved[k] = process.env[k];
  Object.assign(process.env, env);
  const restore = () => Object.entries(saved).forEach(([k, v]) => (v === undefined ? delete process.env[k] : (process.env[k] = v)));
  return Promise.resolve(fn()).finally(restore);
}

test('gh missing: install message with hint', () =>
  withEnv({ PATH: work() }, () => {
    assert.throws(() => gh(['--version']), (e) => e instanceof BkError && /non è installato/.test(e.message) && /cli\.github\.com/.test(e.hint));
  }));

test('gh not logged in: points at gh auth login', () => {
  const fake = installFakeGh(work(), [{ match: ['repo'], stderr: 'To get started with GitHub CLI, please run:  gh auth login', code: 4 }]);
  return withEnv({ ...fake.env, PATH: `${join(fake.env.BK_FAKE_GH_SCENARIO, '..')}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}` }, () => {
    assert.throws(() => gh(['repo', 'view']), (e) => /non è collegato/.test(e.message) && /gh auth login/.test(e.hint));
  });
});

test('gh json: true parses the output', () => {
  const fake = installFakeGh(work(), [{ match: ['x'], stdout: { a: 1 } }]);
  return withEnv({ ...fake.env, PATH: `${join(fake.env.BK_FAKE_GH_SCENARIO, '..')}:${process.env.PATH}` }, () => {
    assert.deepEqual(gh(['x'], { json: true }), { a: 1 });
  });
});

test('findRun picks the first run created after `since`', () => {
  const since = new Date('2026-11-27T10:00:00Z');
  const fake = installFakeGh(work(), [
    {
      match: ['run', 'list'],
      stdout: [
        { databaseId: 3, createdAt: '2026-11-27T10:00:05Z', status: 'queued', conclusion: '', url: 'u3' },
        { databaseId: 2, createdAt: '2026-11-27T10:00:01Z', status: 'queued', conclusion: '', url: 'u2' },
        { databaseId: 1, createdAt: '2026-11-27T09:00:00Z', status: 'completed', conclusion: 'success', url: 'u1' },
      ],
    },
  ]);
  return withEnv({ ...fake.env, PATH: `${join(fake.env.BK_FAKE_GH_SCENARIO, '..')}:${process.env.PATH}` }, async () => {
    const r = await findRun('ci.yml', 'main', since, { timeoutMs: 100, intervalMs: 10 });
    assert.equal(r.id, 2);
    assert.equal(r.url, 'u2');
    assert.deepEqual(fake.calls()[0].slice(0, 5), ['run', 'list', '--workflow', 'ci.yml', '--branch']);
  });
});

test('findRun gives up when only older runs exist', () => {
  const fake = installFakeGh(work(), [{ match: ['run', 'list'], stdout: [{ databaseId: 1, createdAt: '2020-01-01T00:00:00Z', status: 'completed', conclusion: 'success', url: 'u' }] }]);
  return withEnv({ ...fake.env, PATH: `${join(fake.env.BK_FAKE_GH_SCENARIO, '..')}:${process.env.PATH}` }, async () => {
    await assert.rejects(findRun('ci.yml', 'main', new Date(), { timeoutMs: 50, intervalMs: 10 }), /Non trovo il run/);
  });
});
