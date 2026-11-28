// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));
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

it('phone_controls_in_the_bottom_bar_are_at_least_48_px_tall', () => {
  const bars = readFileSync(join(dir, 'Bars.module.css'), 'utf8');
  const phone = bars.match(/\/\* Phone: touch targets[^]*?\n\}\n\n[^]*?\[data-track\]\) \{[^}]*\}/)?.[0] ?? '';
  expect(phone).toMatch(/\.jumpBack,[^{]*\.plain,[^{]*\.primary \{[^}]*min-height: 48px/);
  expect(phone).toMatch(/\[data-track\]\) \{\s*height: 48px/);
  const slider = readFileSync(join(dir, 'ProgressSlider.module.css'), 'utf8');
  expect(slider).toMatch(/@media \(pointer: coarse\) \{\s*\.track \{\s*height: 48px/);
});

it('the_thin_line_has_a_track_even_at_zero', () => {
  const css = readFileSync(join(dir, 'Reader.module.css'), 'utf8');
  const line = css.match(/\n\.line \{[^}]*\}/)?.[0] ?? '';
  expect(line).toMatch(/height: 2px/);
  expect(line).toMatch(/var\(--rd-rule\)/);
  expect(line).toMatch(/var\(--rd-accent-solid\)/);
  expect(line).not.toMatch(/width: calc/);
  const phone = css.match(/\[data-layout='phone'\] \.line \{[^}]*\}/)?.[0] ?? '';
  expect(phone).not.toMatch(/background/);
});

it('sheet_variant_has_no_side_padding_of_its_own', () => {
  const panel = join(dir, '..', 'panel');
  const read = (f: string) => readFileSync(join(panel, f), 'utf8');
  const rule = (css: string, sel: string) => css.match(new RegExp(`\\[data-variant='sheet'\\]\\)? ${sel}[^{]*\\{[^}]*\\}`))?.[0] ?? '';
  expect(rule(read('CompanionPanel.module.css'), '\\.tabs')).toMatch(/padding-left: 0/);
  expect(read('NotesList.module.css')).toMatch(/\[data-variant='sheet'\]\) \.filters,[^{]*\.list[^{]*\{[^}]*padding-right: 0;[^}]*padding-left: 0/);
  expect(rule(read('SearchTab.module.css'), '\\.search')).toMatch(/padding-left: 0/);
});
