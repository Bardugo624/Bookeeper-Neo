// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const split = css.indexOf('html.dark');
const block = (src: string) => new Map([...src.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
const light = block(css.slice(0, split));
const dark = new Map([...light, ...block(css.slice(split))]);

/** Follows `var(--x)` chains until a hex color. */
function resolve(vars: Map<string, string>, name: string, depth = 0): string {
  const value = vars.get(name);
  if (value === undefined || depth > 10) throw new Error(`cannot resolve ${name}`);
  const ref = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value);
  if (ref) return resolve(vars, ref[1]!, depth + 1);
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${name} is not a plain hex color: ${value}`);
  return value;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function ratio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Composites an `rgb(r g b / a)` color over an opaque hex background. */
function over(rgba: string, bg: string): string {
  const m = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)\s*\)$/.exec(rgba);
  if (!m) throw new Error(`not an rgb() with alpha: ${rgba}`);
  const a = Number(m[4]);
  const hex = [1, 2, 3].map((i, k) => Math.round(Number(m[i]) * a + parseInt(bg.slice(1 + k * 2, 3 + k * 2), 16) * (1 - a)).toString(16).padStart(2, '0'));
  return `#${hex.join('')}`;
}

const SURFACES = ['--bk-bg', '--bk-surface', '--bk-surface-raised', '--bk-chrome', '--bk-inset'];
const TEXTS = ['--bk-text', '--bk-text-muted', '--bk-text-faint', '--bk-accent-text'];
const themes = [['light', light], ['dark', dark]] as const;

describe.each(themes)('contrast, %s theme', (_name, vars) => {
  const c = (fg: string, bg: string) => ratio(resolve(vars, fg), resolve(vars, bg));

  it('measures a known pair', () => {
    expect(ratio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });

  it.each(TEXTS.flatMap((t) => SURFACES.map((s) => [t, s] as const)))('%s on %s is at least 4.5:1', (t, s) => {
    expect(c(t, s)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the on-primary text readable on the primary fill and its hover', () => {
    expect(c('--bk-on-primary', '--bk-primary-fill')).toBeGreaterThanOrEqual(4.5);
    expect(c('--bk-on-primary', '--bk-primary-fill-hover')).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the text on the accent surfaces readable', () => {
    expect(c('--bk-on-accent-surface', '--bk-accent-surface')).toBeGreaterThanOrEqual(4.5);
    expect(c('--bk-on-accent-surface', '--bk-accent-surface-strong')).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the danger text and icons readable on the surfaces and the tinted hover', () => {
    for (const s of SURFACES) expect(c('--bk-danger-strong', s), s).toBeGreaterThanOrEqual(4.5);
    for (const s of SURFACES) {
      const tinted = over(vars.get('--bk-danger-bg')!, resolve(vars, s));
      expect(ratio(resolve(vars, '--bk-danger-strong'), tinted), `tinted ${s}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the tooltip text readable on its background', () => {
    expect(c('--bk-tooltip-text', '--bk-tooltip-bg')).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the accent control and the focus ring visible (3:1) on the page', () => {
    expect(c('--bk-accent-control', '--bk-bg')).toBeGreaterThanOrEqual(3);
    expect(c('--bk-focus', '--bk-bg')).toBeGreaterThanOrEqual(3);
  });
});

it('uses the 600 and 700 steps for the primary fill', () => {
  expect(light.get('--bk-primary-fill')).toBe('var(--bk-primary-600)');
  expect(light.get('--bk-primary-fill-hover')).toBe('var(--bk-primary-700)');
});

it('keeps raw palette steps out of every kit stylesheet except tokens.css', () => {
  const files = readdirSync(fileURLToPath(new URL('.', import.meta.url)), { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.css') && f !== 'tokens.css');
  expect(files.length).toBeGreaterThan(10);
  for (const f of files) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(src, f).not.toMatch(/var\(\s*--bk-(primary|neutral)-\d+/);
  }
});
