import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookFile } from './bookFileApi';
import { book, installIntersectionObserver, renderBooks, type Library } from './testkit';

beforeEach(() => {
  localStorage.clear();
  installIntersectionObserver();
});
afterEach(() => vi.unstubAllGlobals());

const epub: BookFile = {
  id: 'f1',
  book_id: 'b1',
  format: 'epub',
  size_bytes: 3_355_443,
  name: 'rosa.epub',
  created_at: 0,
  sha256: 'ab'.repeat(32),
  missing: false,
  uploaded_by: { id: 'u1', display_name: 'Anna' },
};

interface Setup {
  files: BookFile[];
  role?: Library['role'];
  rawHandler?: Library['rawHandler'];
  attach?: { status: number; body: unknown };
}

function setup({ files, role, rawHandler, attach }: Setup) {
  const state = { files: [...files] };
  const lib: Library = {
    books: [book(1, { title: 'Il nome della rosa', file_formats: ['epub'] })],
    ...(role ? { role } : {}),
    ...(rawHandler ? { rawHandler } : {}),
    extra: (r) => {
      if (r.path === '/api/v1/books/b1/files' && r.method === 'GET') return { status: 200, body: state.files };
      if (r.path === '/api/v1/books/b1/files' && r.method === 'POST') {
        const made = attach ?? { status: 201, body: { ...epub, id: 'f2', name: 'nuovo.pdf', format: 'pdf' } };
        if (made.status === 201) state.files.push(made.body as BookFile);
        return made;
      }
      if (r.method === 'DELETE' && r.path === '/api/v1/books/b1/files/f1') {
        state.files = state.files.filter((f) => f.id !== 'f1');
        return { status: 204, body: null };
      }
      return undefined;
    },
  };
  return renderBooks(lib, '/books/b1');
}

const fileCalls = (platform: ReturnType<typeof setup>['platform']) => platform.calls.filter((c) => c.path.includes('/files'));

describe('files block', () => {
  it('lists each file with its format, size and name', async () => {
    setup({ files: [epub] });
    const block = await screen.findByRole('region', { name: 'File' });
    expect(await within(block).findByText('rosa.epub')).toBeInTheDocument();
    expect(within(block).getByText('EPUB')).toBeInTheDocument();
    expect(within(block).getByText(/3,2\sMB/)).toBeInTheDocument();
    expect(within(block).queryByText('File mancante')).toBeNull();
  });

  it('downloads through the platform with the session header', async () => {
    const { platform } = setup({ files: [epub] });
    await userEvent.click(await screen.findByRole('button', { name: 'Scarica rosa.epub' }));
    await waitFor(() => expect(platform.downloads).toHaveLength(1));
    expect(platform.downloads[0]).toMatchObject({
      url: '/api/v1/books/b1/files/f1/content',
      suggestedName: 'rosa.epub',
      headers: { Authorization: 'Bearer access-1' },
    });
  });

  it('renews an expired session once, then downloads again', async () => {
    const { platform } = setup({ files: [epub] });
    let n = 0;
    platform.setDownloadResult(() => (n++ === 0 ? { saved: false, status: 401 } : { saved: true }));
    await userEvent.click(await screen.findByRole('button', { name: 'Scarica rosa.epub' }));
    await waitFor(() => expect(platform.downloads).toHaveLength(2));
    expect(platform.calls.some((c) => c.path === '/api/v1/me')).toBe(true);
  });

  it('says so when the download is refused', async () => {
    const { platform } = setup({ files: [epub] });
    platform.setDownloadResult({ saved: false, status: 404 });
    await userEvent.click(await screen.findByRole('button', { name: 'Scarica rosa.epub' }));
    const block = await screen.findByRole('region', { name: 'File' });
    expect(await within(block).findByRole('alert')).toBeInTheDocument();
  });

  it('says a download is already running when the platform is busy', async () => {
    const { platform } = setup({ files: [epub] });
    platform.setDownloadResult({ saved: false, busy: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Scarica rosa.epub' }));
    const block = await screen.findByRole('region', { name: 'File' });
    expect(await within(block).findByRole('alert')).toHaveTextContent("C'è già un download in corso: aspetta che finisca.");
  });

  it('asks before taking a file off, and tells what follows', async () => {
    const { platform } = setup({ files: [epub] });
    await userEvent.click(await screen.findByRole('button', { name: 'Togli rosa.epub' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Il file sarà tolto dal libro. Se nessun altro libro lo usa, sparisce anche dal disco.')).toBeInTheDocument();
    expect(fileCalls(platform).some((c) => c.method === 'DELETE')).toBe(false);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Togli il file' }));
    await waitFor(() => expect(fileCalls(platform).some((c) => c.method === 'DELETE' && c.path.endsWith('/files/f1'))).toBe(true));
    await waitFor(() => expect(screen.queryByText('rosa.epub')).toBeNull());
  });

  it('keeps the file when the confirmation is cancelled', async () => {
    const { platform } = setup({ files: [epub] });
    await userEvent.click(await screen.findByRole('button', { name: 'Togli rosa.epub' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Annulla' }));
    expect(fileCalls(platform).some((c) => c.method === 'DELETE')).toBe(false);
    expect(screen.getByText('rosa.epub')).toBeInTheDocument();
  });

  it('marks a file that is missing from the disk and does not offer its download', async () => {
    setup({ files: [{ ...epub, missing: true }] });
    expect(await screen.findByText('File mancante')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scarica rosa.epub' })).toBeDisabled();
  });

  it('uploads the chosen file, then attaches it', async () => {
    const raw: Array<{ path: string; size: number }> = [];
    const { platform } = setup({
      files: [],
      rawHandler: (r) => {
        if (r.method !== 'PUT' || !r.path.startsWith('/api/v1/ebook-files')) return undefined;
        raw.push({ path: r.path, size: r.bytes?.length ?? 0 });
        return { status: 200, body: { sha256: 'ab'.repeat(32), format: 'pdf', size_bytes: 4, name: 'nuovo.pdf', metadata: { authors: [] }, has_cover: false } };
      },
    });
    expect(await screen.findByText(/Nessun file attaccato/)).toBeInTheDocument();
    const file = new File(['%PDF'], 'nuovo.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('Scegli un e-book'), file);
    expect(await screen.findByText('nuovo.pdf', { selector: 'span' })).toBeInTheDocument();
    expect(raw).toEqual([{ path: '/api/v1/ebook-files?name=nuovo.pdf', size: 4 }]);
    const post = platform.calls.find((c) => c.method === 'POST' && c.path === '/api/v1/books/b1/files');
    expect(post?.body).toEqual({ sha256: 'ab'.repeat(32), name: 'nuovo.pdf' });
  });

  it('accepts a file dropped on the block', async () => {
    const raw: string[] = [];
    setup({
      files: [],
      rawHandler: (r) => {
        if (r.method !== 'PUT') return undefined;
        raw.push(r.path);
        return { status: 200, body: { sha256: 'cd'.repeat(32), format: 'pdf', size_bytes: 4, name: 'a.pdf', metadata: { authors: [] }, has_cover: false } };
      },
    });
    const block = await screen.findByRole('region', { name: 'File' });
    const file = new File(['%PDF'], 'a.pdf', { type: 'application/pdf' });
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.drop(block, { dataTransfer: { files: [file] } });
    await waitFor(() => expect(raw).toEqual(['/api/v1/ebook-files?name=a.pdf']));
  });

  it('shows an indicator while the file goes up', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((r) => (release = r));
    setup({
      files: [],
      rawHandler: () => undefined,
    });
    // The upload waits on the file read: an unresolved read keeps the indicator on screen.
    const reader = vi.spyOn(FileReader.prototype, 'readAsArrayBuffer').mockImplementation(() => {
      void gate;
    });
    await screen.findByText(/Nessun file attaccato/);
    await userEvent.upload(screen.getByLabelText('Scegli un e-book'), new File(['x'], 'lento.epub'));
    expect(await screen.findByText('Carico lento.epub…')).toBeInTheDocument();
    release?.();
    reader.mockRestore();
  });

  it.each([
    [413, 'payload_too_large', 'Il file è troppo grande: il limite è 200 MB.'],
    [415, 'unsupported_format', 'Questo formato non è supportato. Bookeeper apre EPUB, PDF, MOBI, AZW3, FB2 e CBZ.'],
    [422, 'drm_protected', 'Il file è protetto da DRM. Bookeeper apre solo file senza protezione.'],
  ])('explains a %i refusal', async (status, code, message) => {
    setup({
      files: [],
      rawHandler: (r) => (r.method === 'PUT' ? { status, body: { error_code: code, message: 'x' } } : undefined),
    });
    await screen.findByText(/Nessun file attaccato/);
    await userEvent.upload(screen.getByLabelText('Scegli un e-book'), new File(['x'], 'a.epub'));
    const block = screen.getByRole('region', { name: 'File' });
    expect(await within(block).findByRole('alert')).toHaveTextContent(message);
  });

  it('shows the API message for a 422 that is not DRM', async () => {
    setup({
      files: [],
      rawHandler: (r) => (r.method === 'PUT' ? { status: 422, body: { error_code: 'validation', message: 'Il nome del file non è valido' } } : undefined),
    });
    await screen.findByText(/Nessun file attaccato/);
    await userEvent.upload(screen.getByLabelText('Scegli un e-book'), new File(['x'], 'a.epub'));
    const block = screen.getByRole('region', { name: 'File' });
    const alert = await within(block).findByRole('alert');
    expect(alert).toHaveTextContent('Il nome del file non è valido');
    expect(alert).not.toHaveTextContent('DRM');
  });

  it('keeps red for the confirmation: the row button is neutral', async () => {
    setup({ files: [epub] });
    const remove = await screen.findByRole('button', { name: 'Togli rosa.epub' });
    expect(remove.className).not.toContain('toneDanger');
    await userEvent.click(remove);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Togli il file' }).className).toMatch(/danger/);
  });

  it('draws no block for a guest and asks for no files', async () => {
    const { platform } = setup({ files: [epub], role: 'guest' });
    await screen.findByRole('heading', { level: 1, name: 'Il nome della rosa' });
    expect(screen.queryByRole('region', { name: 'File' })).toBeNull();
    expect(fileCalls(platform)).toHaveLength(0);
  });
});
