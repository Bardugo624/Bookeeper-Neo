// Writes packages/ui/src/quote/advances.json: the advance of each character in Lora Variable at weight 500,
// in thousandths of an em, measured by Chromium. Run it again when @fontsource-variable/lora changes.
// It needs `playwright` and its Chromium, which are not dependencies of this repository.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FONTS_CSS = join(REPO, 'packages/ui/src/fonts.css');
const FILES = join(REPO, 'node_modules/@fontsource-variable/lora/files');
const OUT = join(REPO, 'packages/ui/src/quote/advances.json');

/** Printable ASCII, Latin-1, Latin Extended-A, and the dashes, quotation marks and ellipsis of General Punctuation. */
const RANGES = [
  [0x20, 0x7e],
  [0xa0, 0xff],
  [0x100, 0x17f],
  [0x2010, 0x2026],
  [0x2039, 0x203a],
];

/** The upright Lora faces of fonts.css, with their files inlined. */
function loraFaces() {
  return readFileSync(FONTS_CSS, 'utf8')
    .match(/@font-face\s*\{[^}]*\}/g)
    .filter((face) => face.includes("'Lora Variable'") && face.includes('font-style: normal'))
    .map((face) =>
      face.replace(
        /url\('@fontsource-variable\/lora\/files\/([^']+)'\)/,
        (_, file) => `url(data:font/woff2;base64,${readFileSync(join(FILES, file)).toString('base64')})`,
      ),
    );
}

async function measure(chars) {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>${loraFaces().join('\n')}</style>`);
    return await page.evaluate(async (chars) => {
      await document.fonts.load("500 1000px 'Lora Variable'", chars.join(''));
      const width = (ch, fallback) => {
        const span = document.createElement('span');
        span.style.cssText = `font: 500 1000px 'Lora Variable', ${fallback}; white-space: pre`;
        span.textContent = ch;
        document.body.append(span);
        const px = span.getBoundingClientRect().width;
        span.remove();
        return px;
      };
      // A character Lora lacks comes from the fallback, and two fallbacks give two widths.
      return chars
        .filter((ch) => width(ch, 'serif') === width(ch, 'monospace'))
        .map((ch) => [ch, Math.round(width(ch, 'serif'))]);
    }, chars);
  } finally {
    await browser.close();
  }
}

const chars = RANGES.flatMap(([from, to]) =>
  Array.from({ length: to - from + 1 }, (_, i) => String.fromCodePoint(from + i)),
);
writeFileSync(OUT, JSON.stringify(Object.fromEntries(await measure(chars)), null, 2) + '\n');
