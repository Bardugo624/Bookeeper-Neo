// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The same rule as `packages/ui` (`styleCheck`, not exported): no literal colors, and every `--bk-*` token exists. */
const NAMED = `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood
cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen
darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue
darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite
forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory
khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray
lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue
lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen
mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy
oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru
pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna
silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white
whitesmoke yellow yellowgreen`.split(/\s+/);
const NAMED_RE = new RegExp(`(?<![\\w-])(${NAMED.join('|')})(?![\\w-])`, 'i');

const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** The first literal color in the declarations of `css`, or null. */
export function findLiteralColor(css: string): string | null {
  const src = strip(css)
    .replace(/url\([^)]*\)/gi, '')
    .replace(/(["'])(?:(?!\1).)*\1/g, '""')
    .replace(/[^{};]*\{/g, '{');
  const m = /#[0-9a-f]{3,8}\b/i.exec(src) ?? /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i.exec(src);
  if (m) return m[0];
  for (const decl of src.split(/[;{}]/)) {
    const colon = decl.indexOf(':');
    if (colon === -1) continue;
    const named = NAMED_RE.exec(decl.slice(colon + 1).replace(/var\(\s*--[\w-]*\s*,?/gi, ' '));
    if (named) return named[0];
  }
  return null;
}

const srcDir = fileURLToPath(new URL('..', import.meta.url));
const uiDir = fileURLToPath(new URL('../../../../packages/ui/src/', import.meta.url));

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.module.css'))
    .map((f) => join(dir, f));
}

const modules = cssFiles(srcDir);
const read = (p: string) => strip(readFileSync(p, 'utf8'));
const defined = new Set<string>();
for (const f of [join(uiDir, 'tokens.css'), join(uiDir, 'base/base.css'), ...modules, ...cssFiles(uiDir)]) {
  for (const m of read(f).matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]!);
}

describe('app stylesheets', () => {
  it('finds them', () => {
    expect(modules.length).toBeGreaterThan(20);
    expect(defined.has('--bk-border')).toBe(true);
  });

  it('detects a literal color', () => {
    expect(findLiteralColor('.a { color: var(--bk-x, #3b6ea5); }')).toBe('#3b6ea5');
    expect(findLiteralColor('.a { color: var(--bk-text); background: transparent; }')).toBeNull();
  });

  // The QR code must be true black on white to scan.
  const literalOk = new Set(['modules/devices/QrCode.module.css']);
  it.each(modules.map((f) => [f.slice(srcDir.length), f] as const).filter(([n]) => !literalOk.has(n)))('%s has no literal colors', (_n, file) => {
    expect(findLiteralColor(read(file))).toBeNull();
  });

  it.each(modules.map((f) => [f.slice(srcDir.length), f] as const))('%s uses only existing tokens', (_n, file) => {
    // A token with a fallback (`var(--x, fallback)`) may be missing; one without may not.
    const used = [...read(file).matchAll(/var\(\s*(--[\w-]+)\s*\)/g)].map((m) => m[1]!);
    expect(used.filter((v) => !defined.has(v))).toEqual([]);
  });
});
