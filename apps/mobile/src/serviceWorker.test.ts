// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { workbox, input } from '../vite.config';

describe('the service worker', () => {
  it('the_service_worker_precaches_the_reader', () => {
    const patterns = (workbox.globPatterns ?? []).join(' ');
    for (const ext of ['mjs', 'bcmap', 'pfb', 'ttf']) expect(patterns).toContain(ext);
    expect(patterns).toContain('reader/**');
    expect(patterns).toContain('html'); // reader-frame.html
    expect(workbox.maximumFileSizeToCacheInBytes).toBe(4 * 1024 * 1024);
    // The trial page is gone: nothing is left out any more.
    expect((workbox as Record<string, unknown>).globIgnores).toBeUndefined();
    // The frame is not the app shell: a navigation to it must not get index.html.
    expect(workbox.navigateFallbackAllowlist?.some((r) => r.test('/reader-frame.html'))).toBe(false);
  });

  it('the_build_has_the_reader_frame_as_a_second_entry', () => {
    expect(Object.keys(input)).toEqual(['main', 'reader-frame']);
    expect(input['reader-frame']).toMatch(/reader-frame\.html$/);
  });
});
