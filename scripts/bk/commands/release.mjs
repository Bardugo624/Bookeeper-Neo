import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BkError } from '../errors.mjs';
import { gh, ghRaw } from '../gh.mjs';
import * as git from '../git.mjs';
import { channelVersions } from '../public.mjs';
import { bumpVersion, ensureChangelog, readVersion } from '../version.mjs';
import { channelOf } from '../../update-manifest.mjs';
import { compare, inc } from '../../semver.mjs';
import { dispatch, failedRun, pollUntil, requireMain } from './_shared.mjs';

export const meta = { name: 'release', summary: 'Pubblica una nuova versione: release <patch|minor|major|beta|x.y.z>' };

const KINDS = ['patch', 'minor', 'major', 'beta'];

// True when the section of `version` has no real text (only the empty "-" placeholder).
function sectionIsEmpty(root, version) {
  const text = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
  const start = text.indexOf(`## [${version}]`);
  const rest = text.slice(start).split(/\r?\n/).slice(1);
  const end = rest.findIndex((l) => /^## \[/.test(l));
  const body = (end < 0 ? rest : rest.slice(0, end)).filter((l) => l.trim() && !/^#/.test(l) && !/^\s*[-*]\s*$/.test(l));
  return body.length === 0;
}

function nextVersion(current, arg) {
  try {
    if (KINDS.includes(arg)) return inc(current, arg);
    if (compare(arg, current) <= 0) throw new BkError(`La versione ${arg} non è più alta di quella attuale (${current})`);
    return arg;
  } catch (e) {
    if (e instanceof BkError) throw e;
    throw new BkError(e.message, 'Usa: release <patch|minor|major|beta|x.y.z>');
  }
}

export async function run(args = []) {
  const [arg] = args;
  if (!arg) throw new BkError('Manca la versione', 'Usa: release <patch|minor|major|beta|x.y.z>');
  const root = git.repoRoot();
  requireMain(root, { allow: ['CHANGELOG.md'], action: 'la release' });

  const nuova = nextVersion(readVersion(root), arg);

  const pub = await channelVersions();
  for (const ch of ['stable', 'beta']) {
    if (pub[ch] && compare(nuova, pub[ch]) <= 0) {
      throw new BkError(`La versione ${nuova} non è più alta di quella pubblicata sul canale ${ch} (${pub[ch]})`, 'Scegli una versione più alta');
    }
  }
  const view = ghRaw(['release', 'view', `v${nuova}`]);
  if (view.status !== 0 && !/not found/i.test(view.stderr || '')) {
    throw new BkError(`Non riesco a controllare la release v${nuova} su GitHub: ${(view.stderr || '').trim().split('\n')[0] || `gh è uscito con codice ${view.status}`}`, 'Controlla con: gh auth status');
  }
  if (view.status === 0) {
    throw new BkError(`La release v${nuova} esiste già su GitHub`, 'Guarda il run interrotto: npm run bk -- ci');
  }

  const today = new Date().toISOString().slice(0, 10);
  if (!ensureChangelog(root, nuova, today).existed) {
    console.log(`Ho aggiunto la sezione ${nuova} in CHANGELOG.md: scrivi le novità, poi rilancia npm run bk -- release ${nuova}`);
    return;
  }
  if (sectionIsEmpty(root, nuova)) {
    throw new BkError(`La sezione ${nuova} di CHANGELOG.md è vuota`, 'Scrivi le novità sotto il titolo, poi rilancia il comando');
  }

  let files;
  try {
    files = bumpVersion(root, nuova);
  } catch (e) {
    throw new BkError(e.message);
  }
  git.commit([...files, 'CHANGELOG.md'], `Release ${nuova}`, root);
  git.push(root);
  console.log(`✓ Commit «Release ${nuova}» inviato`);

  const r = await dispatch('release.yml', 'main', ['publish=true']);
  if (!r.ok) throw failedRun('La pubblicazione', r);

  const ch = channelOf(nuova);
  console.log(`Controllo che il canale ${ch} mostri ${nuova}…`);
  const seen = await pollUntil(async () => (await channelVersions())[ch] === nuova, 15 * 60000);
  if (!seen) throw new BkError(`Il canale ${ch} non mostra ancora ${nuova}`, 'Controlla più tardi con: npm run bk -- status');
  console.log(`✓ Il canale ${ch} serve ${nuova}`);
  const rel = gh(['release', 'view', `v${nuova}`, '--json', 'url'], { json: true });
  console.log(`Release: ${rel.url}`);
}
