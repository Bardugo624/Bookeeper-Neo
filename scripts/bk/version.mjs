// Read and change the app version everywhere, keeping each file's format and EOL.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const NL = '\\r?\\n';
const PKGS = ['packages/ui', 'packages/api', 'packages/i18n', 'apps/desktop', 'apps/mobile'];

const read = (root, rel) => readFileSync(join(root, rel), 'utf8');

// Each spot: regex whose groups are (before)(version)(after) for a single match.
const jsonTop = /^(  "version": ")([^"]*)(")/m;
const spots = [
  { file: 'Cargo.toml', re: new RegExp(`(\\[workspace\\.package\\]${NL}(?:[^\\[]*?${NL})?version = ")([^"]*)(")`) },
  { file: 'apps/desktop/src-tauri/tauri.conf.json', re: jsonTop },
  ...PKGS.map((p) => ({ file: `${p}/package.json`, re: jsonTop })),
  ...PKGS.map((p) => ({
    file: 'package-lock.json',
    label: `package-lock.json (${p})`,
    re: new RegExp(`(${NL}    "${p.replace('/', '\\/')}": \\{${NL}(?:      [^${'\\n'}]*${NL})*?      "version": ")([^"]*)(")`),
  })),
  { file: 'packages/api/openapi.json', re: new RegExp(`("info": \\{${NL}(?:    [^\\r\\n]*${NL})*?    "version": ")([^"]*)(")`) },
];

// Workspace crates in Cargo.lock are the [[package]] blocks with no `source` line.
const lockBlock = /\[\[package\]\]\r?\n(?:(?!\[\[package\]\])[^\r\n]*\r?\n?)*/g;
const lockVersion = /^(version = ")([^"]*)(")/m;
function lockWorkspace(text) {
  return [...text.matchAll(lockBlock)].filter((m) => !/^source = /m.test(m[0]));
}

export function readVersion(root) {
  const m = spots[0].re.exec(read(root, 'Cargo.toml'));
  if (!m) throw new Error('Versione non trovata in Cargo.toml');
  return m[2];
}

function found(text, spot) {
  const m = spot.re.exec(text);
  return m ? [m[2]] : [];
}

export function bumpVersion(root, to) {
  const current = readVersion(root);
  const texts = new Map();
  const get = (f) => {
    if (!texts.has(f)) texts.set(f, read(root, f));
    return texts.get(f);
  };
  const bad = [];
  for (const s of spots) {
    const v = found(get(s.file), s);
    if (v.length !== 1 || v[0] !== current) bad.push(s.label ?? s.file);
  }
  const lockVs = lockWorkspace(get('Cargo.lock')).map((m) => lockVersion.exec(m[0])?.[2]);
  if (!lockVs.length || lockVs.some((v) => v !== current)) bad.push('Cargo.lock');
  if (bad.length) {
    throw new Error(`Questi file non hanno la versione ${current}: ${[...new Set(bad)].join(', ')}`);
  }

  for (const s of spots) {
    texts.set(s.file, get(s.file).replace(s.re, (_, a, _v, c) => `${a}${to}${c}`));
  }
  texts.set(
    'Cargo.lock',
    get('Cargo.lock').replace(lockBlock, (block) =>
      /^source = /m.test(block) ? block : block.replace(lockVersion, (_, a, _v, c) => `${a}${to}${c}`),
    ),
  );

  const changed = [];
  for (const [file, text] of texts) {
    if (text === read(root, file)) continue;
    writeFileSync(join(root, file), text);
    changed.push(file);
  }
  return changed;
}

export function ensureChangelog(root, version, date) {
  const file = join(root, 'CHANGELOG.md');
  const text = readFileSync(file, 'utf8');
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`^## \\[${escaped}\\]`, 'm').test(text)) return { existed: true };
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const section = [`## [${version}] - ${date}`, '', '### Added', '', '-', '', ''].join(eol);
  const at = text.search(/^## \[/m);
  const next = at < 0 ? text + (text.endsWith('\n') ? '' : eol) + eol + section : text.slice(0, at) + section + text.slice(at);
  writeFileSync(file, next);
  return { existed: false };
}
