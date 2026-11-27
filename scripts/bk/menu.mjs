// Numbered menus on stdin/stdout. One shared line reader, so piped input is not lost.
import { createInterface } from 'node:readline';
import { BkError } from './errors.mjs';

let rl = null;
const lines = [];
const waiters = [];
let ended = false;

function open() {
  if (rl) return;
  rl = createInterface({ input: process.stdin });
  rl.on('line', (l) => (waiters.length ? waiters.shift()(l) : lines.push(l)));
  rl.on('close', () => {
    ended = true;
    while (waiters.length) waiters.shift()(null);
  });
}

async function ask(question) {
  open();
  process.stdout.write(question);
  if (lines.length) return lines.shift();
  if (ended) return null;
  return new Promise((res) => waiters.push(res));
}

export function closeMenu() {
  rl?.close();
  rl = null;
}

// Show a numbered list and return the key of the chosen item.
export async function choose(title, items) {
  for (;;) {
    console.log(`\n${title}`);
    items.forEach((it, i) => console.log(`  ${i + 1}. ${it.label}`));
    const answer = await ask('Scegli un numero: ');
    if (answer === null) throw new BkError('Nessuna scelta ricevuta');
    const n = Number(answer.trim());
    if (Number.isInteger(n) && n >= 1 && n <= items.length) return items[n - 1].key;
    console.log('Numero non valido, riprova.');
  }
}

// Yes/no question; with `word`, the user must type exactly that word.
export async function confirm(question, word) {
  const answer = await ask(word ? `${question} Scrivi «${word}» per continuare: ` : `${question} (s/n) `);
  if (answer === null) return false;
  const a = answer.trim();
  return word ? a === word : /^(s|si|sì|y|yes)$/i.test(a);
}
