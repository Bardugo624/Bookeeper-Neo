// Builds the static homepage into apps/site/dist: / (Italian) and /en/ (English).
// Usage: node apps/site/build.mjs
// SITE_DOWNLOADS sets the download sources in order, e.g. "index,github" once
// updates.neokeeper.dev/v2/downloads/stable.json is live. Default: "github".

import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strings } from './src/strings.mjs';
import { renderPage } from './src/page.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, 'dist');
const order = process.env.SITE_DOWNLOADS || 'github';
if (!/^(index|github)(,(index|github))*$/.test(order)) throw new Error(`SITE_DOWNLOADS not valid: ${order}`);

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

console.log(`built ${dist} (downloads: ${order})`);
