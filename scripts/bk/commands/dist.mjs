import { join } from 'node:path';
import { BkError } from '../errors.mjs';
import { gh, ghRaw } from '../gh.mjs';
import { channelVersions, fetchJson, updatesBase } from '../public.mjs';
import { channelOf } from '../../update-manifest.mjs';

export const meta = { name: 'dist', summary: 'Link degli installer di una versione (--download per salvarli)' };

// The index lists links per platform; accept an array or a name → url map.
function linksOf(index) {
  const raw = index.files ?? index.downloads ?? index.links ?? index.assets ?? {};
  const list = Array.isArray(raw) ? raw : Object.entries(raw).map(([name, v]) => ({ name, url: typeof v === 'string' ? v : v.url }));
  return list.filter((l) => l.url).map((l) => ({ name: l.name ?? l.platform ?? l.url.split('/').pop(), url: l.url }));
}

export async function run(args = []) {
  const download = args.includes('--download');
  let version = args.find((a) => !a.startsWith('--'))?.replace(/^v/, '');
  if (!version) {
    const idx = await fetchJson(`${updatesBase()}/downloads/stable.json`);
    version = idx?.version ?? (await channelVersions()).stable;
    if (!version) throw new BkError('Non so qual è l’ultima versione stabile', 'Indicala tu: npm run bk -- dist <versione>');
  }
  const index = await fetchJson(`${updatesBase()}/downloads/${channelOf(version)}.json`);
  let links = index && index.version === version ? linksOf(index) : [];
  let from = 'indice dei download';
  if (!links.length) {
    from = 'release su GitHub';
    const rel = gh(['release', 'view', `v${version}`, '--json', 'assets'], { json: true });
    links = (rel.assets ?? []).filter((a) => /^Bookeeper[_-]/.test(a.name) && (!a.name.startsWith('Bookeeper-') || /^Bookeeper-Setup-/.test(a.name))).map((a) => ({ name: a.name, url: a.url }));
  }
  console.log(`Installer della versione ${version} (da: ${from})`);
  if (!links.length) console.log('  nessun file');
  for (const l of links) console.log(`  ${l.name}\n    ${l.url}`);
  if (download) {
    const dir = join('dist', version);
    const r = ghRaw(['release', 'download', `v${version}`, '-D', dir, '-p', 'Bookeeper_*', '-p', 'Bookeeper-Setup-*'], { inherit: true });
    if (r.status !== 0) throw new BkError('Download non riuscito', 'Controlla che la release esista su GitHub');
    console.log(`✓ Salvati in ${dir}`);
  }
}
