import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLOTH_TONES } from '@bookeeper/ui/book';
import type { RawHandler } from '../../platform/testing';
import { mayHaveCover } from './useCover';
import { book, renderSearch } from './testkit';

const png = (headers: Record<string, string> = {}): ReturnType<RawHandler> => ({
  status: 200,
  bytes: new Uint8Array([137, 80, 78, 71]),
  contentType: 'image/png',
  headers: { etag: '"v1"', ...headers },
});

let made: string[];
let revoked: string[];
beforeEach(() => {
  made = [];
  revoked = [];
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: vi.fn(() => {
        const url = `blob:cover-${made.length}`;
        made.push(url);
        return url;
      }),
      revokeObjectURL: vi.fn((u: string) => void revoked.push(u)),
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('cover decision', () => {
  it('asks for an image only when the color is not a placeholder tint', () => {
    expect(mayHaveCover(null)).toBe(false);
    expect(mayHaveCover(undefined)).toBe(false);
    expect(mayHaveCover(CLOTH_TONES[0])).toBe(false);
    expect(mayHaveCover('#123456')).toBe(true);
  });
});

describe('covers through the app transport', () => {
  it('reads the bytes with the session token and shows them as an object URL', async () => {
    const { platform } = renderSearch({
      api: { books: [book(1, { cover_color: '#123456' })] },
      rawHandler: () => png(),
    });
    await screen.findByRole('link', { name: /Libro 1/ });
    await waitFor(() => expect(made).toHaveLength(1));
    expect(platform.fake.rawCalls).toHaveLength(1);
    expect(platform.fake.rawCalls[0]).toMatchObject({
      method: 'GET',
      path: '/api/v1/books/b1/cover',
      headers: { Authorization: 'Bearer access-1' },
    });
    await waitFor(() => expect(document.querySelector('img')).toHaveAttribute('src', made[0]));
  });

  it('revokes the object URL when the list goes away', async () => {
    const { platform, router } = renderSearch({
      api: { books: [book(1, { cover_color: '#123456' })] },
      rawHandler: () => png(),
    });
    await waitFor(() => expect(made).toHaveLength(1));
    void platform;
    await router.navigate('/nowhere');
    await waitFor(() => expect(revoked).toEqual(made));
  });

  it('does not ask for the image of a book the list says has none', async () => {
    const { platform } = renderSearch({
      api: { books: [book(1), book(2, { cover_color: CLOTH_TONES[1] })] },
      rawHandler: () => png(),
    });
    await screen.findByRole('link', { name: /Libro 2/ });
    expect(platform.fake.rawCalls).toHaveLength(0);
    expect(made).toHaveLength(0);
  });

  it('falls back to the placeholder when the book has no stored cover', async () => {
    const { platform } = renderSearch({
      api: { books: [book(1, { cover_color: '#123456' })] },
      rawHandler: () => ({ status: 404, bytes: new TextEncoder().encode('{"error_code":"not_found","message":"x"}'), contentType: null, headers: {} }),
    });
    await screen.findByRole('link', { name: /Libro 1/ });
    await waitFor(() => expect(platform.fake.rawCalls).toHaveLength(1));
    expect(document.querySelector('img')).toBeNull();
  });

  it('shows the large cover on the book page', async () => {
    renderSearch({
      api: { books: [book(1, { cover_color: '#123456' })] },
      rawHandler: () => png(),
      route: '/books/b1',
    });
    await screen.findByRole('region', { name: 'Prestito' });
    await waitFor(() => expect(document.querySelector('img')).toHaveAttribute('src', made[0]));
  });
});
