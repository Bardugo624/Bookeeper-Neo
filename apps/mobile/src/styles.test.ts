// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `@bookeeper/ui` does not export its `styleCheck`, so the rules live here: no literal colors,
 * every `--bk-*` token exists, and animation only where the user allows motion.
 */
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

/** `css` without the blocks of `@media (prefers-reduced-motion: no-preference) { … }`. */
export function withoutAllowedMotion(css: string): string {
  const marker = /@media\s*\(\s*prefers-reduced-motion\s*:\s*no-preference\s*\)\s*\{/g;
  let out = '';
  let last = 0;
  for (let m = marker.exec(css); m; m = marker.exec(css)) {
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < css.length && depth > 0) depth += css[i++] === '{' ? 1 : css[i - 1] === '}' ? -1 : 0;
    out += css.slice(last, m.index);
    last = i;
    marker.lastIndex = i;
  }
  return out + css.slice(last);
}

const MOTION = /(?<![\w-])(animation(-[a-z-]+)?|transition(-[a-z-]+)?)\s*:|@keyframes/i;

const srcDir = fileURLToPath(new URL('.', import.meta.url));
const uiDir = fileURLToPath(new URL('../../../packages/ui/src/', import.meta.url));

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
const named = modules.map((f) => [f.slice(srcDir.length), f] as const);

describe('app stylesheets', () => {
  it('finds them', () => {
    expect(modules.length).toBeGreaterThan(5);
    expect(defined.has('--bk-border')).toBe(true);
  });

  it('detects a literal color', () => {
    expect(findLiteralColor('.a { color: var(--bk-x, #3b6ea5); }')).toBe('#3b6ea5');
    expect(findLiteralColor('.a { color: var(--bk-text); background: transparent; }')).toBeNull();
  });

  it('detects motion outside the allowed media query', () => {
    const ok = '@media (prefers-reduced-motion: no-preference) { .a { animation: x 1s; } @keyframes x { from { opacity: 0 } } }';
    expect(MOTION.test(withoutAllowedMotion(ok))).toBe(false);
    expect(MOTION.test(withoutAllowedMotion(`.b { transition: opacity 1s; } ${ok}`))).toBe(true);
  });

  it.each(named)('%s has no literal colors', (_n, file) => {
    expect(findLiteralColor(read(file))).toBeNull();
  });

  it.each(named)('%s uses no raw palette steps', (_n, file) => {
    expect(read(file)).not.toMatch(/var\(\s*--bk-(primary|neutral)-\d+/);
  });

  it.each(named)('%s uses only existing tokens', (_n, file) => {
    // A token with a fallback (`var(--x, fallback)`) may be missing; one without may not.
    const used = [...read(file).matchAll(/var\(\s*(--[\w-]+)\s*\)/g)].map((m) => m[1]!);
    expect(used.filter((v) => !defined.has(v))).toEqual([]);
  });

  it.each(named)('%s animates only where motion is allowed', (_n, file) => {
    expect(withoutAllowedMotion(read(file))).not.toMatch(MOTION);
  });
});

describe('tab bar stylesheet', () => {
  const css = read(join(srcDir, 'shell/TabBar.module.css'));
  const rule = (name: string) => new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';

  it('makes every tab at least 44px tall', () => {
    expect(Number(/min-height:\s*(\d+)px/.exec(rule('tab'))?.[1])).toBeGreaterThanOrEqual(44);
  });

  it('keeps clear of the home indicator', () => {
    expect(rule('bar')).toContain('env(safe-area-inset-bottom)');
  });
});
