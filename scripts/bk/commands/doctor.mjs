import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ghRaw } from '../gh.mjs';
import { BkError } from '../errors.mjs';
import * as git from '../git.mjs';

export const meta = { name: 'doctor', summary: 'Controlla che il PC sia pronto (node, git, gh, accesso)' };

const attempt = (fn) => {
  try {
    return fn();
  } catch (e) {
    if (e instanceof BkError) return null;
    throw e;
  }
};

export async function run() {
  const major = Number(process.versions.node.split('.')[0]);
  const hasGit = spawnSync('git', ['--version'], { shell: false }).status === 0;
  const ghVersion = attempt(() => ghRaw(['--version']));
  const hasGh = ghVersion?.status === 0;
  const installGh = 'Installa GitHub CLI (Windows: winget install GitHub.cli)';
  const ghOk = (args) => hasGh && attempt(() => ghRaw(args))?.status === 0;

  const checks = [
    [major >= 20, `Node ${process.versions.node}`, 'Serve Node 20 o più recente: https://nodejs.org'],
    [hasGit, 'git installato', 'Installa git: https://git-scm.com'],
    [hasGh, 'gh installato', installGh],
    [ghOk(['auth', 'status']), 'gh collegato a GitHub', hasGh ? 'Esegui: gh auth login' : installGh],
    [ghOk(['repo', 'view', '--json', 'nameWithOwner']), 'accesso al repository', 'Collegati con: gh auth login, poi controlla di essere nella cartella del progetto'],
    [hasGit && !!attempt(() => git.isClean()), 'albero di lavoro pulito', 'Salva o metti da parte le modifiche: git status'],
    [existsSync(join(git.repoRoot(), 'node_modules')), 'node_modules presente', 'Esegui: npm ci'],
  ];
  let bad = 0;
  for (const [ok, label, fix] of checks) {
    console.log(`${ok ? '✓' : '✗'} ${label}`);
    if (!ok) {
      bad++;
      console.log(`  → ${fix}`);
    }
  }
  if (bad) process.exitCode = 1;
}
