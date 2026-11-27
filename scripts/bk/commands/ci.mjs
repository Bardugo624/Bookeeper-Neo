import { BkError } from '../errors.mjs';
import { gh, ghRaw, findRun, watch, fmtRun } from '../gh.mjs';
import * as git from '../git.mjs';

export const meta = { name: 'ci', summary: 'Run della CI: elenco, run, watch, logs, rerun' };

const FIELDS = 'databaseId,status,conclusion,headBranch,createdAt';

function latestId(b) {
  const runs = gh(['run', 'list', '--branch', b, '--limit', '1', '--json', FIELDS], { json: true });
  if (!runs.length) throw new BkError(`Nessun run per il ramo ${b}`, 'Avviane uno con: npm run bk -- ci run');
  return runs[0].databaseId;
}

function follow(id) {
  if (!watch(id)) throw new BkError(`La CI è fallita (run ${id})`, `Guarda i log con: npm run bk -- ci logs ${id}`);
  console.log('✓ La CI è passata');
}

export async function run(args = []) {
  const [sub, id] = args;
  const b = git.branch();
  switch (sub) {
    case undefined: {
      const runs = gh(['run', 'list', '--branch', b, '--limit', '10', '--json', FIELDS], { json: true });
      console.log(`Ultimi run del ramo ${b}:`);
      if (!runs.length) console.log('  nessun run');
      for (const r of runs) console.log(`  ${fmtRun(r)}`);
      return;
    }
    case 'run': {
      if (!git.isPushed()) throw new BkError(`Il ramo ${b} non è ancora su GitHub`, `Esegui: git push -u origin ${b}`);
      const since = new Date();
      gh(['workflow', 'run', 'ci.yml', '--ref', b]);
      console.log('CI avviata, cerco il run…');
      const found = await findRun('ci.yml', b, since);
      console.log(`Run ${found.id}: ${found.url}`);
      return follow(found.id);
    }
    case 'watch':
      return follow(id ?? latestId(b));
    case 'logs':
      ghRaw(['run', 'view', String(id ?? latestId(b)), '--log-failed'], { inherit: true });
      return;
    case 'rerun':
      gh(['run', 'rerun', String(id ?? latestId(b)), '--failed']);
      console.log('✓ Run rilanciato (solo i passi falliti)');
      return;
    default:
      throw new BkError(`Sottocomando sconosciuto: ${sub}`, 'Usa: ci [run|watch|logs|rerun] [id]');
  }
}
