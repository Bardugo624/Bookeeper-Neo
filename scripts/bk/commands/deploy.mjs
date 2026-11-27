import { BkError } from '../errors.mjs';
import { ghRaw } from '../gh.mjs';
import * as git from '../git.mjs';
import { confirm } from '../menu.mjs';
import { serverVersion } from '../public.mjs';
import { readVersion } from '../version.mjs';
import { dispatch, failedRun, pollUntil, requireMain, statusOf, vpsManifest } from './_shared.mjs';

export const meta = { name: 'deploy', summary: 'Aggiorna la VPS: deploy <server|caddy>' };

export async function run(args = []) {
  const [target] = args;
  if (!['server', 'caddy'].includes(target)) throw new BkError('Indica cosa aggiornare', 'Usa: deploy <server|caddy>');
  const root = git.repoRoot();
  requireMain(root, { action: 'il deploy' });
  if (!(await confirm(`Aggiorno ${target} sulla VPS di produzione.`, 'deploy'))) {
    console.log('Annullato: non ho cambiato nulla.');
    return;
  }
  const r = await dispatch('vps-deploy.yml', 'main', [`target=${target}`]);
  if (!r.ok) throw failedRun('Il deploy', r);
  if (target === 'server') {
    const want = readVersion(root);
    const ok = await pollUntil(async () => (await serverVersion()) === want, 2 * 60000);
    if (!ok) throw new BkError(`Il server non risponde con la versione ${want}`, 'Controlla con: npm run bk -- status');
    console.log(`✓ Il server risponde con la versione ${want}`);
  } else {
    const s = await statusOf(vpsManifest());
    console.log(`Caddy: ${vpsManifest()} risponde ${s ? s.status : 'nulla'}`);
    const red = ghRaw(['variable', 'get', 'UPDATES_REDIRECT']);
    const want = red.status === 0 && red.stdout.trim() === 'on' ? 302 : 200;
    if (s?.status !== want) throw new BkError('Caddy non risponde come previsto', 'Guarda i log del deploy: npm run bk -- ci');
  }
}
