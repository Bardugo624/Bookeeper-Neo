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

// True when the working tree has no changes except the paths in `allow`.
export function isClean(allow = [], cwd) {
  const out = must(['status', '--porcelain'], cwd);
  return out.split('\n').filter(Boolean).every((l) => allow.includes(l.slice(3).replace(/^"|"$/g, '')));
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
