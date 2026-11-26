// @vitest-environment node
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
it('defines the 2A state, focus and tooltip tokens in light and dark', () => {
  const added = ['--bk-ok','--bk-ok-bg','--bk-ok-strong','--bk-warn','--bk-warn-bg','--bk-warn-strong',
    '--bk-danger','--bk-danger-bg','--bk-danger-strong','--bk-danger-fill','--bk-danger-fill-hover','--bk-on-primary','--bk-focus',
    '--bk-tooltip-bg','--bk-tooltip-text','--bk-ease-spring'];
  const [light, dark] = css.split('html.dark');
  for (const name of added) {
    expect(light, name).toContain(`${name}:`);
    expect(dark, `${name} dark`).toContain(`${name}:`);
  }
});
it('keeps the contract values for the new tokens', () => {
  expect(css).toMatch(/--bk-warn:\s*#b7791f/i);
  expect(css).toMatch(/--bk-danger:\s*#b4493b/i);
  expect(css).toMatch(/--bk-on-primary:\s*#ffffff/i);
  expect(css).toContain('--bk-focus: var(--bk-primary-400)');
  expect(css).toContain('--bk-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)');
});
it('defines the cover tokens in light and dark', () => {
  const [light, dark] = css.split('html.dark');
  for (const name of ['--bk-cover-light', '--bk-cover-shade']) {
    expect(light, name).toContain(`${name}:`);
    expect(dark, `${name} dark`).toContain(`${name}:`);
  }
});
it('puts the bundled font family first in both stacks, keeping the fallbacks', () => {
  expect(css).toMatch(/--bk-font-ui:\s*'Inter Variable',[^;]*sans-serif;/);
  expect(css).toMatch(/--bk-font-serif:\s*'Lora Variable',[^;]*Georgia, serif;/);
});
it('stacks dropdowns above the dialogs they open from', () => {
  const z = (name: string) => Number(new RegExp(`${name}:\\s*(\\d+)`).exec(css)?.[1]);
  // Select and Menu render in a portal: below the modal layers, an open dialog hides them.
  expect(z('--bk-z-dropdown')).toBeGreaterThan(z('--bk-z-overlay'));
  expect(z('--bk-z-dropdown')).toBeGreaterThan(z('--bk-z-modal'));
  expect(z('--bk-z-dropdown')).toBeLessThan(z('--bk-z-toast'));
});
