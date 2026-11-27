import { readVersion } from '../version.mjs';
import { BkError } from '../errors.mjs';
import { gh, fmtRun } from '../gh.mjs';
import * as git from '../git.mjs';
import { channelVersions, serverVersion } from '../public.mjs';

export const meta = { name: 'status', summary: 'Mostra ramo, versione, CI e canali di aggiornamento' };

const WORKFLOWS = ['ci.yml', 'release.yml', 'vps-deploy.yml'];

// Run a section; a failure prints one line instead of stopping the whole report.
async function section(title, fn) {
  console.log(`\n${title}`);
  try {
    await fn();
  } catch (e) {
    if (!(e instanceof BkError)) throw e;
    console.log(`  ✗ ${e.message}${e.hint ? ` → ${e.hint}` : ''}`);
  }
}

export async function run() {
  await section('Repository', () => {
    console.log(`  Ramo: ${git.branch()}`);
    console.log(`  Ultimo commit: ${git.lastCommit()}`);
    console.log(`  Su GitHub: ${git.isPushed() ? 'sì' : 'no (esegui git push)'}`);
    console.log(`  Versione: ${readVersion(git.repoRoot())}`);
  });
  await section('Ultimi run', () => {
    for (const wf of WORKFLOWS) {
      const runs = gh(['run', 'list', '--workflow', wf, '--limit', '3', '--json', 'databaseId,status,conclusion,headBranch,createdAt'], { json: true });
      console.log(`  ${wf}`);
      if (!runs.length) console.log('    nessun run');
      for (const r of runs) console.log(`    ${fmtRun(r)}`);
    }
  });
  await section('Canali di aggiornamento', async () => {
    const c = await channelVersions();
    const from = (ch) => (c.sources[ch] === 'vps' ? ' (dalla VPS, R2 non risponde)' : '');
    console.log(`  stable: ${c.stable ?? 'non risponde'}${from('stable')}`);
    console.log(`  beta:   ${c.beta ?? 'non risponde'}${from('beta')}`);
    console.log(`  fonte:  ${c.source === 'r2' ? 'R2' : c.source === 'vps' ? 'VPS' : 'nessuna'}`);
  });
  await section('Server', async () => {
    console.log(`  Versione: ${(await serverVersion()) ?? 'non risponde'}`);
  });
}
