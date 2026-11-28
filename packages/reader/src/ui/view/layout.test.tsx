// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const dir = join(process.cwd(), 'src/ui/view');
const MEDIA = '@media (prefers-reduced-motion: no-preference)';

/** The CSS with every `@media (prefers-reduced-motion: no-preference) { … }` block cut out. */
function outsideMotion(css: string): string {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const at = css.indexOf(MEDIA, i);
    if (at === -1) return out + css.slice(i);
    out += css.slice(i, at);
    let depth = 0;
    let j = css.indexOf('{', at);
    for (; j < css.length; j++) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}' && --depth === 0) break;
    }
    i = j + 1;
  }
  return out;
}

it('animations_sit_inside_reduced_motion_no_preference', () => {
  const files = readdirSync(dir).filter((f) => f.endsWith('.css'));
  expect(files.length).toBeGreaterThan(0);
  const offenders = files.filter((f) => /\b(animation|transition)\b|@keyframes|scroll-behavior/.test(outsideMotion(readFileSync(join(dir, f), 'utf8'))));
  expect(offenders).toEqual([]);
  const motion = files.some((f) => readFileSync(join(dir, f), 'utf8').includes(MEDIA));
  expect(motion).toBe(true);
});

it('the_motion_helper_cuts_nested_blocks', () => {
  expect(outsideMotion(`a{x:1} ${MEDIA} { a { transition: x } @keyframes k { from {a:b} } } b{y:2}`).replace(/\s+/g, '')).toBe('a{x:1}b{y:2}');
});
