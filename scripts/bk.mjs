#!/usr/bin/env node
// bk: the project's helper. `npm run bk` opens a menu; `npm run bk -- <command> [args]` runs one.
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BkError } from './bk/errors.mjs';
import { choose, closeMenu } from './bk/menu.mjs';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'bk', 'commands');

// Menu order: day-to-day first, then publishing; any other command follows alphabetically.
const ORDER = ['ci', 'status', 'build', 'release', 'updates', 'deploy', 'dist', 'doctor'];
const rank = (name) => (ORDER.includes(name) ? ORDER.indexOf(name) : ORDER.length);

// Every commands/<name>.mjs with `meta` and `run` is a command.
export async function loadCommands() {
  const files = readdirSync(dir).filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs')).sort();
  const cmds = [];
  for (const f of files) {
    const mod = await import(pathToFileURL(join(dir, f)).href);
    if (mod.meta?.name && typeof mod.run === 'function') cmds.push(mod);
  }
  return cmds.sort((a, b) => rank(a.meta.name) - rank(b.meta.name) || a.meta.name.localeCompare(b.meta.name));
}

function printHelp(cmds) {
  console.log('Uso: npm run bk -- <comando> [argomenti]\n       npm run bk          (menu)\n\nComandi:');
  const width = Math.max(...cmds.map((c) => c.meta.name.length));
  for (const c of cmds) console.log(`  ${c.meta.name.padEnd(width)}  ${c.meta.summary}`);
  console.log(`  ${'help'.padEnd(width)}  Mostra questo elenco`);
}

export async function main(argv) {
  const cmds = await loadCommands();
  let [name, ...args] = argv;
  if (name === 'help' || name === '--help' || name === '-h') return printHelp(cmds);
  if (!name) {
    name = await choose('Cosa vuoi fare?', cmds.map((c) => ({ key: c.meta.name, label: `${c.meta.name} — ${c.meta.summary}` })));
  }
  const cmd = cmds.find((c) => c.meta.name === name);
  if (!cmd) throw new BkError(`Comando sconosciuto: ${name}`, 'Vedi i comandi con: npm run bk -- help');
  await cmd.run(args);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2))
    .catch((e) => {
      if (e instanceof BkError) {
        console.error(`✗ ${e.message}`);
        if (e.hint) console.error(`→ ${e.hint}`);
        if (process.env.BK_DEBUG) console.error(e.stack);
      } else {
        console.error(`✗ Errore inatteso: ${e.message}`);
        if (process.env.BK_DEBUG) console.error(e.stack);
      }
      process.exitCode = 1;
    })
    .finally(closeMenu);
}
