import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { DMG_DIR } from './dmg-background.mjs';

const W = 660;
const H = 400;

function pngSize(file) {
  const b = readFileSync(join(DMG_DIR, file));
  assert.equal(b.subarray(1, 4).toString('latin1'), 'PNG', `${file} non è un PNG`);
  assert.equal(b.subarray(12, 16).toString('latin1'), 'IHDR');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

test('le immagini misurano 660×400 e 1320×800', () => {
  assert.deepEqual(pngSize('background.png'), [660, 400]);
  assert.deepEqual(pngSize('background@2x.png'), [1320, 800]);
});

const html = readFileSync(join(DMG_DIR, 'background.html'), 'utf8');

test('background.html non carica nulla da internet', () => {
  assert.doesNotMatch(html, /\b(?:src|href)\s*=\s*["']?\s*(?:https?:)?\/\//i);
  assert.doesNotMatch(html, /url\(\s*["']?\s*(?:https?:)?\/\//i);
});

test('background.html usa i token, non colori letterali', () => {
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/@font-face\{[^}]*\}/g, '');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(css, /\brgba?\(/i);
});

// Rettangoli dichiarati dalle regole CSS degli elementi visibili del corpo.
function boxes() {
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/@font-face\{[^}]*\}/g, '');
  const body = html.slice(html.indexOf('<body>'));
  const out = [];
  for (const m of css.matchAll(/(?<=^|\})\s*\.([\w-]+)\s*\{([^}]*)\}/g)) {
    const [, cls, decl] = m;
    if (!new RegExp(`class="${cls}"`).test(body)) continue;
    const p = (k) => {
      const r = decl.match(new RegExp(`(?:^|;)\\s*${k}\\s*:\\s*(-?[\\d.]+)(?:px)?\\s*(?:;|$)`));
      return r ? Number(r[1]) : undefined;
    };
    if (!/position\s*:\s*absolute/.test(decl)) continue;
    const left = p('left') ?? 0;
    const top = p('top') ?? 0;
    const right = p('right');
    const width = p('width') ?? (right !== undefined ? W - left - right : W - left);
    const height = p('height') ?? 24; // testo: una riga abbondante
    out.push({ cls, x0: left, y0: top, x1: left + width, y1: top + height });
  }
  return out;
}

const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

test('lo sfondo lascia libere le zone delle icone e delle etichette', () => {
  const els = boxes();
  assert.ok(els.length >= 4, `elementi trovati: ${els.map((e) => e.cls)}`);
  const zones = [];
  for (const cx of [180, 480]) {
    zones.push({ cls: `icona@${cx}`, x0: cx - 64, y0: 116, x1: cx + 64, y1: 244 });
    zones.push({ cls: `etichetta@${cx}`, x0: cx - 64, y0: 244, x1: cx + 64, y1: 280 });
  }
  for (const e of els) for (const z of zones) {
    assert.ok(!overlap(e, z), `.${e.cls} si sovrappone a ${z.cls}`);
  }
  assert.ok(els.every((e) => e.x0 >= 0 && e.x1 <= W && e.y1 <= H + 24));
});
