// Genera le immagini dello sfondo del DMG da apps/desktop/src-tauri/dmg/background.html.
// Si lancia a mano, quando lo sfondo cambia: node scripts/setup/dmg-background.mjs
// Playwright è già installato sulla macchina: NON è fra le dipendenze del repository.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

export const DMG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'apps', 'desktop', 'src-tauri', 'dmg');
export const SIZE = { width: 660, height: 400 };
export const OUTPUTS = [
  { file: 'background.png', scale: 1 },
  { file: 'background@2x.png', scale: 2 },
];

export async function generate(dir = DMG_DIR) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  try {
    for (const { file, scale } of OUTPUTS) {
      const ctx = await browser.newContext({ viewport: SIZE, deviceScaleFactor: scale, colorScheme: 'light' });
      const page = await ctx.newPage();
      await page.goto(pathToFileURL(join(dir, 'background.html')).href);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: join(dir, file), clip: { x: 0, y: 0, ...SIZE } });
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await generate();
  console.log('Scritte background.png e background@2x.png in', DMG_DIR);
}
