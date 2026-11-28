// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The rules of the desktop and mobile style tests (`@bookeeper/ui` does not export its `styleCheck`): no literal
 * colors, every `--bk-*` token exists, and motion only inside `@media (prefers-reduced-motion: no-preference)`.
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
function findLiteralColor(css: string): string | null {
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

/** `css` without its `@media (prefers-reduced-motion: no-preference) { … }` blocks. */
function withoutAllowedMotion(css: string): string {
  const marker = /@media\s*\(\s*prefers-reduced-motion\s*:\s*no-preference\s*\)\s*\{/g;
  let out = '';
  let last = 0;
  for (let m = marker.exec(css); m; m = marker.exec(css)) {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < css.length && depth > 0; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
    }
    out += css.slice(last, m.index);
    last = i;
    marker.lastIndex = i;
  }
  return out + css.slice(last);
}

const MOTION = /(?<![\w-])(animation(-[a-z-]+)?|transition(-[a-z-]+)?)\s*:|@keyframes/i;

const ANIMATION_WORDS = new Set(
  `none infinite normal reverse alternate alternate-reverse forwards backwards both running paused ease ease-in ease-out
ease-in-out linear step-start step-end initial inherit unset revert`.split(/\s+/),
);

/**
 * The keyframes a module plays that it neither defines nor marks `global(…)`. CSS Modules rename those to a local
 * name that no keyframes carry, so the animation never runs.
 */
function unreachableKeyframes(css: string): string[] {
  const local = new Set([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]!));
  const out: string[] = [];
  for (const m of css.matchAll(/(?<![\w-])animation(?:-name)?\s*:\s*([^;}]+)/g)) {
    const words = m[1]!.replace(/global\([^)]*\)/g, ' ').replace(/[\w-]*\((?:[^()]|\([^()]*\))*\)/g, ' ');
    for (const word of words.split(/[\s,]+/)) {
      if (word && !ANIMATION_WORDS.has(word) && !/^[\d.]/.test(word) && !local.has(word)) out.push(word);
    }
  }
  return out;
}

const srcDir = fileURLToPath(new URL('.', import.meta.url));
const uiDir = fileURLToPath(new URL('../../../packages/ui/src/', import.meta.url));

function cssFiles(dir: string, suffix: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith(suffix))
    .map((f) => join(dir, f));
}

// Every stylesheet of the Setup: the modules and `app/global.css`.
const sheets = cssFiles(srcDir, '.css');
const read = (p: string) => strip(readFileSync(p, 'utf8'));
const defined = new Set<string>();
for (const f of [join(uiDir, 'tokens.css'), join(uiDir, 'base/base.css'), ...sheets, ...cssFiles(uiDir, '.module.css')]) {
  for (const m of read(f).matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]!);
}
const named = sheets.map((f) => [f.slice(srcDir.length), f] as const);

describe('setup stylesheets', () => {
  it('finds them', () => {
    expect(sheets.length).toBeGreaterThan(5);
    expect(sheets.some((f) => f.endsWith('global.css'))).toBe(true);
    expect(defined.has('--bk-scrim')).toBe(true);
  });

  it('detects a literal color', () => {
    expect(findLiteralColor('.a { color: var(--bk-x, #3b6ea5); }')).toBe('#3b6ea5');
    expect(findLiteralColor('.a { box-shadow: 0 -8px 24px color-mix(in srgb, var(--bk-scrim) 4%, transparent); }')).toBeNull();
  });

  it('detects motion outside the allowed media query', () => {
    const ok = '@media (prefers-reduced-motion: no-preference) { .a { animation: x 1s; } @keyframes x { from { opacity: 0 } } }';
    expect(withoutAllowedMotion(ok)).not.toMatch(MOTION);
    expect(withoutAllowedMotion(`.b { transition: opacity 1s; } ${ok}`)).toMatch(MOTION);
    // Motion by default with a `reduce` override is the pattern the rule replaces.
    const old = '.p { transition: transform 1s; } @media (prefers-reduced-motion: reduce) { .p { transition: none; } }';
    expect(withoutAllowedMotion(old)).toMatch(MOTION);
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

  it.each(named)('%s moves only where motion is allowed', (_n, file) => {
    expect(withoutAllowedMotion(read(file))).not.toMatch(MOTION);
  });

  it('detects keyframes a module cannot reach', () => {
    expect(unreachableKeyframes('.a { animation: bk-rise var(--bk-dur) var(--bk-ease); }')).toEqual(['bk-rise']);
    expect(unreachableKeyframes('.a { animation: global(bk-rise) var(--bk-dur) var(--bk-ease); }')).toEqual([]);
    expect(unreachableKeyframes('.a { animation: x calc(var(--d) * 2) 3 both; } @keyframes x { from { opacity: 0 } }')).toEqual([]);
  });

  it.each(named.filter(([n]) => n.endsWith('.module.css')))('%s plays only keyframes it can reach', (_n, file) => {
    expect(unreachableKeyframes(read(file))).toEqual([]);
  });
});

describe('focus on titles', () => {
  it('shows no ring on the titles that take the focus when the panel changes', () => {
    expect(read(join(srcDir, 'app/global.css'))).toMatch(/\[tabindex='-1'\]:focus\s*\{\s*outline:\s*none;/);
  });
});

describe('the working panel', () => {
  const panel = /\.panel\s*\{([^}]*)\}/.exec(read(join(srcDir, 'shell/SetupLayout.module.css')))?.[1] ?? '';

  it('casts the soft shadow of the drafts over the frontispiece, from a token', () => {
    expect(panel).toMatch(/box-shadow:\s*0 -8px 24px color-mix\(in srgb, var\(--bk-scrim\) 4%, transparent\)/);
  });

  it('has a medium height that leaves 226px to the compact frontispiece', () => {
    const css = read(join(srcDir, 'shell/SetupLayout.module.css'));
    expect(css).toMatch(/\.panel\[data-height='medium'\]\s*\{\s*transform:\s*translateY\(76px\);/);
    expect(css).toMatch(/\.stage\[data-compact\]\[data-panel='medium'\]\s*\.top\s*\{\s*height:\s*226px;/);
  });

  it('rests without a transition: it slides only when motion is allowed', () => {
    expect(panel).not.toMatch(MOTION);
  });
});
