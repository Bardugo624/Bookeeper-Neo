// Git helpers. Always spawn without a shell; `cwd` defaults to the current directory.
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BkError } from './errors.mjs';

export const repoRoot = () => process.env.BK_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function git(args, cwd = process.cwd()) {
  const r = spawnSync('git', args, { encoding: 'utf8', shell: false, cwd });
  if (r.error) {
    if (r.error.code === 'ENOENT') throw new BkError('git non è installato', 'Installa git: https://git-scm.com');
    throw new BkError(`Non riesco a eseguire git: ${r.error.message}`);
  }
  return r;
}

function must(args, cwd) {
  const r = git(args, cwd);
  if (r.status !== 0) {
    const first = (r.stderr || '').trim().split('\n')[0] || `codice ${r.status}`;
    throw new BkError(`git ${args[0]} non è riuscito: ${first}`);
  }
  return r.stdout.trim();
}

export const branch = (cwd) => must(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
export const shortSha = (cwd) => must(['rev-parse', '--short', 'HEAD'], cwd);
export const lastCommit = (cwd) => must(['log', '-1', '--pretty=%h %s'], cwd);

// Paths touched in the working tree, from the raw NUL-separated porcelain output.
// The output is not trimmed: the leading space of ` M path` is part of the status column.
// A rename or copy (`R`/`C`) is followed by a second entry holding the original path.
function changedPaths(cwd) {
  const r = git(['status', '--porcelain', '-z'], cwd);
  if (r.status !== 0) {
    const first = (r.stderr || '').trim().split('\n')[0] || `codice ${r.status}`;
    throw new BkError(`git status non è riuscito: ${first}`);
  }
  const entries = r.stdout.split('\0');
  const paths = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.length < 4) continue;
    paths.push(e.slice(3));
    if (e[0] === 'R' || e[0] === 'C') paths.push(entries[++i]);
  }
  return paths;
}

// True when the working tree has no changes except the paths in `allow`.
export function isClean(allow = [], cwd) {
  return changedPaths(cwd).every((p) => allow.includes(p));
}

// Fetch this branch from origin and compare it with HEAD.
export function isPushed(cwd) {
  const b = branch(cwd);
  if (git(['fetch', 'origin', b], cwd).status !== 0) return false;
  const remote = git(['rev-parse', `origin/${b}`], cwd);
  return remote.status === 0 && remote.stdout.trim() === must(['rev-parse', 'HEAD'], cwd);
}

export function commit(paths, message, cwd) {
  must(['add', '--', ...paths], cwd);
  must(['commit', '-m', message], cwd);
}

export function push(cwd) {
  must(['push', '-u', 'origin', 'HEAD'], cwd);
}
