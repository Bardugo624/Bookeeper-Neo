import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BkError } from '../errors.mjs';
import { gh, ghRaw } from '../gh.mjs';
import { channelVersions } from '../public.mjs';
import { confirm } from '../menu.mjs';
import { dispatch, failedRun, statusOf, updatesBase, vpsBase, vpsManifest } from './_shared.mjs';

export const meta = { name: 'updates', summary: 'Aggiornamenti su R2: stato, seed, withdraw, switch' };

const script = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'updates-r2.mjs');

async function showChannels() {
  const v = await channelVersions();
  console.log(`  stable: ${v.stable ?? 'non risponde'}${v.sources.stable ? ` (${v.sources.stable})` : ''}`);
  console.log(`  beta:   ${v.beta ?? 'non risponde'}${v.sources.beta ? ` (${v.sources.beta})` : ''}`);
  console.log(`  fonte:  ${v.source ?? 'nessuna'}`);
}

function redirectState() {
  const r = ghRaw(['variable', 'get', 'UPDATES_REDIRECT']);
  return r.status === 0 ? r.stdout.trim() || 'off' : 'off (non impostato)';
}

function setRedirect(value) {
  gh(['variable', 'set', 'UPDATES_REDIRECT', '--body', value]);
}

// R2 must be complete before the VPS may send clients there.
function ready() {
  const r = spawnSync(process.execPath, [script, 'ready', '--base', updatesBase(), '--vps', vpsBase()], { encoding: 'utf8' });
  if (r.status !== 0) {
    const why = `${r.stderr || ''}${r.stdout || ''}`.split('\n').map((l) => l.trim().replace(/^not ready: /, '')).filter(Boolean);
    throw new BkError('R2 non è pronto: il rimando resta spento', why.join('\n   '));
  }
}

async function switchOn() {
  ready();
  if (!(await confirm('Accendo il rimando: i client scaricheranno gli aggiornamenti da R2.', 'deploy'))) return console.log('Annullato: non ho cambiato nulla.');
  setRedirect('on');
  let r;
  try {
    r = await dispatch('vps-deploy.yml', 'main', ['target=caddy']);
  } catch (e) {
    setRedirect('off');
    throw new BkError(`Il deploy non è partito: ho rimesso il rimando a off (${e.message})`, e.hint);
  }
  if (!r.ok) {
    setRedirect('off');
    throw new BkError(`Il deploy è fallito: ho rimesso il rimando a off (run ${r.id}: ${r.url})`, `Guarda i log con: npm run bk -- ci logs ${r.id}`);
  }
  const s = await statusOf(vpsManifest());
  if (s?.status !== 302 || !s.location?.startsWith(`${updatesBase()}/`)) {
    throw new BkError(`La VPS non rimanda a R2 (risposta ${s?.status ?? 'nessuna'}${s?.location ? ` verso ${s.location}` : ''})`, 'Per tornare indietro: npm run bk -- updates switch --off');
  }
  console.log(`✓ Rimando acceso: ${vpsManifest()} → ${s.location}`);
}

async function switchOff() {
  if (!(await confirm('Spengo il rimando: i client torneranno alla VPS.', 'deploy'))) return console.log('Annullato: non ho cambiato nulla.');
  setRedirect('off');
  const r = await dispatch('vps-deploy.yml', 'main', ['target=caddy']);
  if (!r.ok) throw failedRun('Il deploy', r);
  const s = await statusOf(vpsManifest());
  if (s?.status !== 200) throw new BkError(`La VPS non risponde 200 (risposta ${s?.status ?? 'nessuna'})`, 'Controlla Caddy sulla VPS');
  console.log('✓ Rimando spento: la VPS risponde 200');
}

export async function run(args = []) {
  const [sub, ...rest] = args;
  switch (sub) {
    case undefined:
      console.log('Canali di aggiornamento:');
      await showChannels();
      console.log(`  rimando (UPDATES_REDIRECT): ${redirectState()}`);
      return;
    case 'seed': {
      if (!(await confirm('Copio i manifest e gli installer attuali su R2.'))) return console.log('Annullato: non ho cambiato nulla.');
      const r = await dispatch('updates.yml', 'main', ['action=seed']);
      if (!r.ok) throw failedRun('Il seed', r);
      console.log('✓ Seed completato');
      return;
    }
    case 'withdraw': {
      const [channel, version] = rest;
      if (!['stable', 'beta'].includes(channel) || !version) throw new BkError('Mancano canale o versione', 'Usa: updates withdraw <stable|beta> <versione>');
      if (!(await confirm(`Ritiro la versione ${version} dal canale ${channel}.`, 'ritira'))) return console.log('Annullato: non ho cambiato nulla.');
      const r = await dispatch('updates.yml', 'main', ['action=withdraw', `channel=${channel}`, `version=${version}`]);
      if (!r.ok) throw failedRun('Il ritiro', r);
      console.log(`✓ Versione ${version} ritirata. Ora:`);
      await showChannels();
      return;
    }
    case 'switch':
      return rest.includes('--off') ? switchOff() : switchOn();
    default:
      throw new BkError(`Sottocomando sconosciuto: ${sub}`, 'Usa: updates [seed|withdraw <canale> <versione>|switch [--off]]');
  }
}
