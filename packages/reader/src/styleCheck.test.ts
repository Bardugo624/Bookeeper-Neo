import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, it } from 'vitest';

const srcDir = join(process.cwd(), 'src');
const ALLOWED = new Set(['model/themeColors.ts', 'model/highlightColors.ts']);

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return files(p);
    return /\.(ts|tsx|css)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

// The rule of `packages/ui/src/styleCheck.ts` (not exported): hex, color functions and CSS keywords.
const NAMED_COLORS = `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown
burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod
darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen
darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue
firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew
hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray
lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid
mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream
mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen
paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue
saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen
steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen`.split(/\s+/);
const NAMED = new RegExp(`(?<![\\w-])(${NAMED_COLORS.join('|')})(?![\\w-])`, 'i');
const HEX = /(?<![\w&])#[0-9a-f]{3,8}\b/i;
const FN = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i;

function literalColor(source: string, isCss = false): string | null {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/url\([^)]*\)/gi, '');
  const m = HEX.exec(code) ?? FN.exec(code);
  if (m) return m[0];
  if (!isCss) return null;
  const src = code.replace(/(["'])(?:(?!\1).)*\1/g, '""').replace(/[^{};]*\{/g, '{');
  for (const decl of src.split(/[;{}]/)) {
    const colon = decl.indexOf(':');
    if (colon === -1) continue;
    const named = NAMED.exec(decl.slice(colon + 1).replace(/var\(\s*--[\w-]*\s*,?/gi, ' '));
    if (named) return named[0];
  }
  return null;
}

it('the_check_catches_keywords_and_lab', () => {
  expect(literalColor('.bar { background: white; color: black }', true)).toBe('white');
  expect(literalColor('.a { color: var(--rd-ink, red) }', true)).toBe('red');
  expect(literalColor('.a { color: var(--rd-ink) }', true)).toBeNull();
  expect(literalColor('const c = "lab(50% 20 30)";')).toBe('lab(');
});

it('literal_colors_only_in_the_two_data_files', () => {
  const offenders = files(srcDir)
    .map((f) => relative(srcDir, f).split('\\').join('/'))
    .filter((f) => !ALLOWED.has(f))
    .filter((f) => literalColor(readFileSync(join(srcDir, f), 'utf8'), f.endsWith('.css')) !== null);
  expect(offenders).toEqual([]);
});
