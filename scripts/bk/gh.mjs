// Thin wrapper over the GitHub CLI. Never uses a shell.
import { spawnSync } from 'node:child_process';
import { BkError } from './errors.mjs';

const NOT_INSTALLED = ['gh non è installato', 'Installa GitHub CLI: https://cli.github.com'];
const NOT_LOGGED = ['gh non è collegato a GitHub', 'Esegui: gh auth login'];

// Raw spawn: returns the spawnSync result, or throws BkError when gh is missing.
export function ghRaw(args, { inherit = false } = {}) {
  const r = spawnSync('gh', args, { encoding: 'utf8', shell: false, stdio: inherit ? 'inherit' : 'pipe' });
  if (r.error) {
    if (r.error.code === 'ENOENT') throw new BkError(...NOT_INSTALLED);
    throw new BkError(`Non riesco a eseguire gh: ${r.error.message}`);
  }
  return r;
}

export function gh(args, { json = false, inherit = false } = {}) {
  const r = ghRaw(args, { inherit });
  if (r.status !== 0) {
    const err = (r.stderr || '').trim();
    if (/gh auth login|not logged in|authentication|GH_TOKEN/i.test(err)) throw new BkError(...NOT_LOGGED);
    const first = err.split('\n')[0] || `gh è uscito con codice ${r.status}`;
    throw new BkError(`gh non è riuscito: ${first}`);
  }
  if (!json) return r.stdout ?? '';
  try {
    return JSON.parse(r.stdout);
  } catch {
    throw new BkError('Risposta di gh non valida');
  }
}

const RUN_FIELDS = 'databaseId,createdAt,status,conclusion,url';
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// First run of `workflow` on `ref` created at or after `since`; retries up to timeoutMs.
export async function findRun(workflow, ref, since, { timeoutMs = 60000, intervalMs = 3000 } = {}) {
  const floor = Math.floor(since.getTime() / 1000) * 1000; // GitHub dates have 1 s resolution
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const runs = gh(['run', 'list', '--workflow', workflow, '--branch', ref, '--limit', '10', '--json', RUN_FIELDS], { json: true });
    const hit = runs
      .filter((r) => new Date(r.createdAt).getTime() >= floor)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];
    if (hit) return { id: hit.databaseId, url: hit.url, status: hit.status, conclusion: hit.conclusion };
    if (Date.now() >= deadline) {
      throw new BkError('Non trovo il run appena avviato', 'Guarda su GitHub nella scheda Actions, o riprova tra poco.');
    }
    await sleep(intervalMs);
  }
}

// Follow a run in the terminal; true when it succeeded.
export function watch(id) {
  const r = ghRaw(['run', 'watch', String(id), '--exit-status'], { inherit: true });
  return r.status === 0;
}

export function fmtRun(r) {
  const state = r.status === 'completed' ? r.conclusion || 'completed' : r.status;
  const mark = state === 'success' ? '✓' : state === 'failure' ? '✗' : '…';
  const when = r.createdAt ? ` ${r.createdAt.slice(0, 16).replace('T', ' ')}` : '';
  return `${mark} #${r.databaseId} ${state}${r.headBranch ? ` [${r.headBranch}]` : ''}${when}`;
}
