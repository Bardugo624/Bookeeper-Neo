import { BkError } from '../errors.mjs';
import { gh } from '../gh.mjs';
import * as git from '../git.mjs';
import { confirm } from '../menu.mjs';
import { readVersion } from '../version.mjs';
import { dispatch, failedRun } from './_shared.mjs';

export const meta = { name: 'build', summary: 'Compila gli installer sulla CI, senza pubblicare' };

export async function run() {
  const root = git.repoRoot();
  const b = git.branch(root);
  if (!git.isClean([], root)) throw new BkError('Ci sono modifiche non salvate', 'Salvale con un commit o scartale');
  if (!git.isPushed(root)) throw new BkError(`Il ramo ${b} non è ancora su GitHub`, `Esegui: git push -u origin ${b}`);
  const r = await dispatch('release.yml', b, ['publish=false']);
  if (!r.ok) throw failedRun('La compilazione', r);
  console.log('✓ Installer compilati');
  if (await confirm('Scarico gli installer in dist/?')) {
    const dir = `dist/${readVersion(root)}-${git.shortSha(root)}`;
    gh(['run', 'download', String(r.id), '-p', 'installers-*', '-D', dir], { inherit: true });
    console.log(`✓ Salvati in ${dir}`);
  }
}
