/** Shared by the base, overlays and book style tests: literal-color detection in CSS module sources. */

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

export function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Describes the first literal color in the CSS (hex, rgb/hsl, CSS color keyword), or null. `transparent`, `currentColor` and `inherit` are fine. */
export function findLiteralColor(css: string): string | null {
  const src = stripComments(css)
    .replace(/url\([^)]*\)/gi, '')
    .replace(/(["'])(?:(?!\1).)*\1/g, '""')
    // Selectors and class names are not colors: only look at declaration values.
    .replace(/[^{};]*\{/g, '{');
  const m =
    /#[0-9a-f]{3,8}\b/i.exec(src) ?? /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i.exec(src);
  if (m) return m[0];
  for (const decl of src.split(/[;{}]/)) {
    const colon = decl.indexOf(':');
    if (colon === -1) continue;
    // Only the variable name is dropped: a fallback, however nested, is checked like any other value.
    const named = NAMED.exec(decl.slice(colon + 1).replace(/var\(\s*--[\w-]*\s*,?/gi, ' '));
    if (named) return named[0];
  }
  return null;
}
