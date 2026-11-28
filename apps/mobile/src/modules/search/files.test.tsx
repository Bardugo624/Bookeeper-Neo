import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ME, ok } from '../../session/fixtures';
import type { RawRequest, RawResponse } from '@bookeeper/api';
import { book, renderSearch } from './testkit';

const file = (over = {}) => ({
  id: 'f1',
  book_id: 'b1',
  format: 'epub',
  size_bytes: 2_500_000,
  name: 'dune.epub',
  sha256: 'sha-f1',
  created_at: 1,
  uploaded_by: null,
  missing: false,
  ...over,
});
const bytes = (s: string) => new TextEncoder().encode(s);
const raw = (status: number, body: Uint8Array | object = new Uint8Array(), headers: Record<string, string> = {}): RawResponse => ({
  status,
  bytes: body instanceof Uint8Array ? body : bytes(JSON.stringify(body)),
  contentType: null,
  headers,
});

interface Setup {
  role?: string;
  files?: unknown[];
  listError?: boolean;
  raw?: (req: RawRequest) => RawResponse;
  attach?: { status: number; body: unknown };
}

function open(s: Setup = {}) {
  return renderSearch({
    api: {
      books: [book(1, { id: 'b1' })],
      override: (call) => {
        const path = call.path.replace('/api/v1', '');
        if (path === '/me') return ok({ ...ME, user: { ...ME.user, role: s.role ?? 'owner' } });
        if (path === '/books/b1/files' && call.method === 'GET') return s.listError ? { status: 500, body: { error_code: 'internal', message: 'x' } } : ok(s.files ?? [file()]);
        if (path === '/books/b1/files' && call.method === 'POST') return s.attach ?? { status: 201, body: file({ id: 'f2', format: 'pdf', name: 'x.pdf' }) };
        return undefined;
      },
    },
    rawHandler: (req) => (s.raw ?? (() => raw(404)))(req),
    route: '/books/b1',
  });
}
const block = async () => within(await screen.findByRole('region', { name: 'File' }));

beforeEach(() => {
  // jsdom's File has no arrayBuffer().
  File.prototype.arrayBuffer ??= function (this: File) {
    return new Promise<ArrayBuffer>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as ArrayBuffer);
      r.readAsArrayBuffer(this);
    });
  };
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe('files block', () => {
  it('says the list failed, not that there are no files, and offers a retry', async () => {
    open({ listError: true });
    // The query retries before it gives up.
    const b = within(await screen.findByRole('region', { name: 'File' }, { timeout: 12_000 }));
    expect(await b.findByRole('alert')).toBeInTheDocument();
    expect(b.queryByText(/Nessun file/)).toBeNull();
    expect(b.getByRole('button', { name: 'Riprova' })).toBeInTheDocument();
  }, 15_000);

  it('lists each file with format and size', async () => {
    open();
    const b = await block();
    expect(await b.findByText('EPUB')).toBeInTheDocument();
    expect(b.getByText(/2,4|2,5/)).toBeInTheDocument();
    expect(b.getByRole('button', { name: /^Scarica EPUB/ })).toBeInTheDocument();
  });

  it('is absent for a guest, and nothing is asked', async () => {
    const view = open({ role: 'guest' });
    await screen.findByRole('heading', { level: 2, name: 'Libro 1' });
    await waitFor(() => expect(view.platform.fake.calls.some((c) => c.path === '/api/v1/me')).toBe(true));
    expect(screen.queryByRole('region', { name: 'File' })).toBeNull();
    expect(view.platform.fake.calls.some((c) => c.path.endsWith('/files'))).toBe(false);
  });

  it('downloads with the token and saves a blob under the name of the server', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('Frank Herbert - Dune.epub');
    });
    const view = open({ raw: () => raw(200, bytes('PK'), { 'content-disposition': "attachment; filename*=UTF-8''Frank%20Herbert%20-%20Dune.epub" }) });
    await userEvent.click(await (await block()).findByRole('button', { name: /^Scarica EPUB/ }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(view.platform.fake.rawCalls[0]).toMatchObject({ method: 'GET', path: '/api/v1/books/b1/files/f1/content' });
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('says so when the download fails', async () => {
    open({ raw: () => raw(403, { error_code: 'forbidden', message: 'x' }) });
    await userEvent.click(await (await block()).findByRole('button', { name: /^Scarica EPUB/ }));
    expect(await (await block()).findByRole('alert')).toHaveTextContent('permessi');
  });

  it('offers no download for a file missing on the server', async () => {
    open({ files: [file({ missing: true })] });
    const b = await block();
    expect(await b.findByText('Il file non è sul server')).toBeInTheDocument();
    expect(b.queryByRole('button', { name: /^Scarica/ })).toBeNull();
  });

  it('adds a file: upload, then attach', async () => {
    const view = open({ files: [], raw: () => raw(200, { sha256: 'abc', format: 'pdf', size_bytes: 3, name: 'x.pdf' }) });
    const b = await block();
    const input = await b.findByLabelText('Aggiungi il file');
    expect(input).toHaveAttribute('accept', '.epub,.pdf,.mobi,.azw3,.fb2,.cbz');
    await userEvent.upload(input, new File(['%PDF'], 'x.pdf', { type: 'application/pdf' }));
    await waitFor(() => expect(view.platform.fake.calls.some((c) => c.method === 'POST' && c.path.endsWith('/books/b1/files'))).toBe(true));
    expect(view.platform.fake.rawCalls[0]).toMatchObject({ method: 'PUT', path: '/api/v1/ebook-files?name=x.pdf' });
    expect(view.platform.fake.calls.find((c) => c.method === 'POST')!.body).toEqual({ sha256: 'abc', name: 'x.pdf' });
  });

  it('is read only for no one but guests: a member may add', async () => {
    open({ role: 'member' });
    expect(await (await block()).findByLabelText('Aggiungi il file')).toBeInTheDocument();
  });

  it.each([
    [415, 'unsupported_format', 'non è supportato'],
    [422, 'drm_protected', 'DRM'],
    [413, 'payload_too_large', 'troppo grande'],
  ])('shows the message for %s %s', async (status, code, text) => {
    open({ files: [], raw: () => raw(status, { error_code: code, message: 'x' }) });
    await userEvent.upload(await (await block()).findByLabelText('Aggiungi il file'), new File(['x'], 'x.epub'));
    expect(await (await block()).findByRole('alert')).toHaveTextContent(text);
  });

  it('shows the message when the file is already attached', async () => {
    open({
      files: [],
      raw: () => raw(200, { sha256: 'abc' }),
      attach: { status: 409, body: { error_code: 'file_already_attached', message: 'x' } },
    });
    await userEvent.upload(await (await block()).findByLabelText('Aggiungi il file'), new File(['x'], 'x.epub'));
    expect(await (await block()).findByRole('alert')).toHaveTextContent('già collegato');
  });
});
