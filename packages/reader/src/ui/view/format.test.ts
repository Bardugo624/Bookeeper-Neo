import { describe, expect, it } from 'vitest';
import it_ from '../../../../i18n/src/locales/it/reader.json';
import { percentPhrase } from './format';

const t = (key: string, vars?: Record<string, string | number>) => {
  const [, group, name] = key.split('.');
  return ((it_ as unknown as Record<string, Record<string, string>>)[group!]![name!] as string).replace('{percent}', String(vars?.percent));
};

describe('format', () => {
  it('the_article_follows_the_number', () => {
    const cases: [number, string][] = [
      [0, 'allo 0%'], [0.4, 'allo 0,4%'], [1, "all'1%"], [1.5, "all'1,5%"], [8, "all'8%"], [11, "all'11%"], [18, 'al 18%'],
      [45, 'al 45%'], [80, "all'80%"], [83, "all'83%"], [89, "all'89%"], [90, 'al 90%'], [100, 'al 100%'],
    ];
    for (const [p, want] of cases) expect(percentPhrase(t, 'reader.bottom.jump_back', p)).toBe(`Torna ${want}`);
    expect(percentPhrase(t, 'reader.resume.go', 0)).toBe('Vai allo 0%');
  });
});
