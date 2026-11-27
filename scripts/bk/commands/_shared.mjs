// Helpers shared by build, release, updates and deploy. Not a command: it has no `meta`.
import { BkError } from '../errors.mjs';
import { gh, findRun, watch } from '../gh.mjs';
import * as git from '../git.mjs';
import { updatesBase } from '../public.mjs';

export const vpsBase = () => process.env.BK_VPS_BASE || 'https://app.neokeeper.dev/updates';
export const vpsManifest = () => `${vpsBase()}/stable/latest.json`;
export const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// `main` branch, clean tree (except `allow`), branch already on GitHub.
export function requireMain(root, { allow = [], action }) {
  const b = git.branch(root);
  if (b !== 'main') throw new BkError(`Per ${action} devi essere sul ramo main (ora sei su ${b})`, 'Esegui: git switch main');
  if (!git.isClean(allow, root)) {
    throw new BkError('Ci sono modifiche non salvate', allow.length ? `Salva o scarta le modifiche (solo ${allow.join(', ')} può restare)` : 'Salvale con un commit o scartale');
  }
  if (!git.isPushed(root)) throw new BkError(`Il ramo ${b} non è ancora su GitHub`, `Esegui: git push -u origin ${b}`);
}

// Start a workflow, find its run and follow it. Returns { id, url, ok }.
export async function dispatch(workflow, ref, fields = []) {
  const since = new Date();
  gh(['workflow', 'run', workflow, '--ref', ref, ...fields.flatMap((f) => ['-f', f])]);
  console.log(`${workflow} avviato, cerco il run…`);
  const found = await findRun(workflow, ref, since);
  console.log(`Run ${found.id}: ${found.url}`);
  const ok = watch(found.id);
  return { id: found.id, url: found.url, ok };
}

export function failedRun(what, run) {
  return new BkError(`${what} è fallito (run ${run.id}: ${run.url})`, `Guarda i log con: npm run bk -- ci logs ${run.id}`);
}

// Call `fn` every interval until it returns something truthy; null on timeout.
export async function pollUntil(fn, defaultTimeoutMs) {
  const interval = Number(process.env.BK_POLL_MS) || 20000;
  const timeout = Number(process.env.BK_POLL_TIMEOUT_MS) || defaultTimeoutMs;
  const deadline = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() >= deadline) return null;
    await sleep(interval);
  }
}

// HTTP status of a URL (redirects not followed); null when unreachable.
export async function statusOf(url) {
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
    return { status: res.status, location: res.headers.get('location') };
  } catch {
    return null;
  }
}

export { updatesBase };
