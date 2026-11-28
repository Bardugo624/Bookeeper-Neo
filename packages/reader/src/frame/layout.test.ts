import { describe, expect, it } from 'vitest';
import { absoluteUrls } from './layout';

describe('absoluteUrls', () => {
  it('resolves root-relative urls so a blob: page can load them', () => {
    const out = absoluteUrls('@font-face{src:url(/assets/a.woff2) format("woff2"), url("b.woff2"), url(data:x)}', 'http://h.test/p/s.css');
    expect(out).toContain('url("http://h.test/assets/a.woff2")');
    expect(out).toContain('url("http://h.test/p/b.woff2")');
    expect(out).toContain('url(data:x)');
  });
});
