import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

it('defines the brand primary', () => { expect(css).toMatch(/--bk-primary-500:\s*#4d8369/i); });
it('has no PrimeVue references', () => { expect(css).not.toMatch(/--p-/); });
it('defines every semantic token in light and dark', () => {
  const required = ['--bk-bg','--bk-surface','--bk-surface-raised','--bk-chrome','--bk-inset','--bk-border',
    '--bk-border-strong','--bk-text','--bk-text-strong','--bk-text-muted','--bk-text-faint',
    '--bk-shadow-1','--bk-shadow-2','--bk-shadow-3','--bk-shadow-book','--bk-shadow-book-lift'];
  const [light, dark] = css.split('html.dark');
  for (const name of required) {
    expect(light, name).toContain(`${name}:`);
    expect(dark, `${name} dark`).toContain(`${name}:`);
  }
});
it('keeps motion and radius values', () => {
  for (const decl of ['--bk-dur-fast: 150ms','--bk-dur: 200ms','--bk-dur-slow: 280ms',
    '--bk-radius-sm: 8px','--bk-radius: 12px','--bk-radius-lg: 16px']) expect(css).toContain(decl);
});
