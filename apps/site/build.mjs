// Builds the static homepage into apps/site/dist: / (Italian) and /en/ (English).
// Usage: node apps/site/build.mjs
// SITE_DOWNLOADS sets the installer sources in order. Default "index,github,manifest": the R2
// index when it answers, then the GitHub release, then the updater manifest (R2, then the VPS)
// with the installer names built from the release scheme. Nothing to rebuild when R2 goes live.

import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strings } from './src/strings.mjs';
import { renderPage } from './src/page.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, 'dist');
const order = process.env.SITE_DOWNLOADS || 'index,github,manifest';
if (!/^(index|github|manifest)(,(index|github|manifest))*$/.test(order)) throw new Error(`SITE_DOWNLOADS not valid: ${order}`);

await rm(dist, { recursive: true, force: true });
await mkdir(join(dist, 'en'), { recursive: true });
await mkdir(join(dist, 'js'), { recursive: true });

await writeFile(join(dist, 'index.html'), renderPage(strings.it, { downloadsOrder: order }));
await writeFile(join(dist, 'en', 'index.html'), renderPage(strings.en, { downloadsOrder: order }));
await cp(join(here, 'src', 'site.css'), join(dist, 'site.css'));
for (const f of ['site.js', 'downloads.mjs', 'house.mjs', 'plan.mjs']) {
  await cp(join(here, 'src', f), join(dist, 'js', f));
}
await cp(join(here, 'public'), dist, { recursive: true });

// Every file a page asks for gets a fingerprint of its content in its URL (?v=…), so a new
// release can never meet an older copy of a stylesheet, script or image in a browser or CDN
// cache. Modules go first and in dependency order: a module's URL changes when one it imports does.
const hash = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 10);
const version = {};
async function stampModule(name) {
  const file = join(dist, 'js', name);
  let src = await readFile(file, 'utf8');
  src = src.replace(/from '\.\/([\w-]+\.mjs)'/g, (m, dep) => {
    if (!version[dep]) throw new Error(`${name} imports ${dep} before it is stamped`);
    return `from './${dep}?v=${version[dep]}'`;
  });
  await writeFile(file, src);
  version[name] = hash(src);
}
for (const name of ['house.mjs', 'downloads.mjs', 'plan.mjs', 'site.js']) await stampModule(name);
version['site.css'] = hash(await readFile(join(dist, 'site.css')));
for (const dir of ['shots', '.']) {
  for (const f of await readdir(join(dist, dir))) {
    if (/\.(webp|png)$/.test(f)) version[`${dir}/${f}`.replace(/^\.\//, '')] = hash(await readFile(join(dist, dir, f)));
  }
}
for (const page of ['index.html', 'en/index.html']) {
  const file = join(dist, page);
  let html = await readFile(file, 'utf8');
  html = html
    .replace(/"\/site\.css"/g, `"/site.css?v=${version['site.css']}"`)
    .replace(/"\/js\/site\.js"/g, `"/js/site.js?v=${version['site.js']}"`)
    .replace(/\/((?:shots\/)?[\w-]+\.(?:webp|png))(?=["\s])/g, (m, path) => (version[path] ? `/${path}?v=${version[path]}` : m));
  await writeFile(file, html);
}

console.log(`built ${dist} (downloads: ${order})`);
