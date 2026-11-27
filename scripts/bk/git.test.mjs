import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { branch, isClean, isPushed, shortSha, commit, push } from './git.mjs';

const sh = (cwd, ...a) => {
  const r = spawnSync('git', a, { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
};

function repo() {
  const base = mkdtempSync(join(tmpdir(), 'bk-git-'));
  const remote = join(base, 'remote.git');
  const work = join(base, 'work');
  sh(base, 'init', '--bare', '-b', 'main', remote);
  sh(base, 'clone', remote, work);
  for (const [k, v] of [['user.name', 't'], ['user.email', 't@t']]) sh(work, 'config', k, v);
  sh(work, 'checkout', '-b', 'main');
  writeFileSync(join(work, 'a.txt'), 'a');
  sh(work, 'add', '.');
  sh(work, 'commit', '-m', 'one');
  return work;
}

test('branch, shortSha and isClean', () => {
  const w = repo();
  assert.equal(branch(w), 'main');
  assert.match(shortSha(w), /^[0-9a-f]{7,}$/);
  assert.equal(isClean([], w), true);
  writeFileSync(join(w, 'b.txt'), 'b');
  assert.equal(isClean([], w), false);
  assert.equal(isClean(['b.txt'], w), true);
});

test('isPushed is false until the branch is pushed, then true', () => {
  const w = repo();
  assert.equal(isPushed(w), false);
  push(w);
  assert.equal(isPushed(w), true);
  writeFileSync(join(w, 'c.txt'), 'c');
  commit(['c.txt'], 'two', w);
  assert.equal(isPushed(w), false);
});
