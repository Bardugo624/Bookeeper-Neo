import test from 'node:test';
import assert from 'node:assert/strict';
import { okRules, repo, runBk, failingWatch, workflowCalls } from './_testkit.mjs';

test('build starts release.yml with publish=false on the current branch and downloads on yes', async () => {
  const { dir } = repo('work');
  const r = await runBk(['build'], { scenario: okRules([{ match: ['run', 'download'], code: 0 }]), cwd: dir, input: 's\n' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(workflowCalls(r), [['workflow', 'run', 'release.yml', '--ref', 'work', '-f', 'publish=false']]);
  const dl = r.calls().find((a) => a[0] === 'run' && a[1] === 'download');
  assert.deepEqual(dl.slice(0, 5), ['run', 'download', '7', '-p', 'installers-*']);
  assert.equal(dl[5], '-D');
  assert.match(dl[6], /\/dist\/\d+\.\d+\.\d+-[0-9a-f]+$/);
});

test('build does not download on no', async () => {
  const { dir } = repo('work');
  const r = await runBk(['build'], { scenario: okRules(), cwd: dir, input: 'n\n' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.calls().some((a) => a[1] === 'download'), false);
});

test('build stops on a dirty tree and on a failed run', async () => {
  const { dir } = repo('work');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(`${dir}/x.txt`, 'x');
  let r = await runBk(['build'], { scenario: okRules(), cwd: dir });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /modifiche non salvate/);
  assert.equal(workflowCalls(r).length, 0);
  const clean = repo('work');
  r = await runBk(['build'], { scenario: okRules([failingWatch]), cwd: clean.dir });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /ci logs 7/);
});
