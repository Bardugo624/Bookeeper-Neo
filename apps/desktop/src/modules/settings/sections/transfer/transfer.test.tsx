import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { resetLocalePreferenceForTest } from '../../../../app/i18n';
import { REPORT, renderTransfer } from './testkit';

beforeEach(() => {
  localStorage.clear();
  resetLocalePreferenceForTest();
});
afterEach(() => vi.useRealTimers());

const csv = (name = 'books.csv', body = 'Title,Author\nDune,Herbert') => new File([body], name, { type: 'text/csv' });
const importCalls = (p: { calls: { path: string; body?: unknown }[] }) => p.calls.filter((c) => c.path.endsWith('/import'));

async function pick(file: File) {
  await userEvent.upload(await screen.findByLabelText('Scegli un file o trascinalo qui'), file);
}

describe('import', () => {
  it('refuses a file over the limit without sending anything', async () => {
    const { platform } = renderTransfer();
    const big = csv('big.csv');
    Object.defineProperty(big, 'size', { value: 10 * 1024 * 1024 + 1 });
    await pick(big);
    expect(await screen.findByText('Il file è troppo grande: il limite è 10 MB.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importa' })).toBeDisabled();
    expect(importCalls(platform)).toHaveLength(0);
  });

  it('sends the chosen format and the file text', async () => {
    const { platform } = renderTransfer();
    await pick(csv());
    await userEvent.click(screen.getByRole('tab', { name: 'Calibre' }));
    await userEvent.click(screen.getByRole('button', { name: 'Importa' }));
    await screen.findByRole('group', { name: "Rapporto dell'importazione" });
    expect(importCalls(platform)[0]?.body).toEqual({ format: 'calibre', content: 'Title,Author\nDune,Herbert', dry_run: false });
  });

  it('sends "auto" by default', async () => {
    const { platform } = renderTransfer();
    await pick(csv());
    await userEvent.click(screen.getByRole('button', { name: 'Importa' }));
    await screen.findByRole('group', { name: "Rapporto dell'importazione" });
    expect((importCalls(platform)[0]?.body as { format: string }).format).toBe('auto');
  });

  it('shows the three counts with plurals, the error rows and a link to the books', async () => {
    renderTransfer();
    await pick(csv());
    await userEvent.click(screen.getByRole('button', { name: 'Importa' }));
    const report = await screen.findByRole('group', { name: "Rapporto dell'importazione" });
    expect(within(report).getByText('3 libri importati')).toBeInTheDocument();
    expect(within(report).getByText('2 saltati perché già presenti')).toBeInTheDocument();
    expect(within(report).getByText('1 riga con errore')).toBeInTheDocument();
    const table = within(report).getByRole('table', { name: "Righe con errore dell'importazione" });
    expect(within(table).getByText('title is required')).toBeInTheDocument();
    expect(within(table).getByText('4')).toBeInTheDocument();
    expect(within(report).getByRole('link', { name: 'Vai ai libri' })).toHaveAttribute('href', '/books');
  });

  it('uses the singular for one imported book', async () => {
    renderTransfer({ importAnswer: () => ({ status: 200, body: { ...REPORT, new: 1, duplicates: 0, invalid: 0, errors: [] } }) });
    await pick(csv());
    await userEvent.click(screen.getByRole('button', { name: 'Importa' }));
    expect(await screen.findByText('1 libro importato')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "Scarica l'elenco" })).not.toBeInTheDocument();
  });

  it('shows at most 100 error rows', async () => {
    const errors = Array.from({ length: 150 }, (_, i) => ({ row: i + 2, message: `bad ${i}` }));
    renderTransfer({ importAnswer: () => ({ status: 200, body: { ...REPORT, invalid: 150, errors } }) });
    await pick(csv());
    await userEvent.click(screen.getByRole('button', { name: 'Importa' }));
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(101);
    expect(screen.getByText('Sono elencate le prime 100 righe con errore su 150.')).toBeInTheDocument();
  });

  it('downloads the error list as CSV', async () => {
    const errors = [{ row: 4, message: 'title, "required"' }, { row: 9, message: '=bad' }];
    const { platform } = renderTransfer({ importAnswer: () => ({ status: 200, body: { ...REPORT, invalid: 2, errors } }) });
    await pick(csv());
    await userEvent.click(screen.getByRole('button', { name: 'Importa' }));
    await userEvent.click(await screen.findByRole('button', { name: "Scarica l'elenco" }));
    await waitFor(() => expect(platform.saved).toHaveLength(1));
    const saved = platform.saved[0]!;
    expect(saved.mime).toBe('text/csv');
    expect(saved.suggestedName).toMatch(/\.csv$/);
    expect(new TextDecoder().decode(saved.bytes)).toBe('row,message\r\n4,"title, ""required"""\r\n9,\'=bad\r\n');
  });

  it('invalidates the books and stats queries after an import', async () => {
    const spy = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
    renderTransfer();
    await pick(csv());
    await userEvent.click(screen.getByRole('button', { name: 'Importa' }));
    await screen.findByRole('group', { name: "Rapporto dell'importazione" });
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown[] }).queryKey));
    expect(keys).toContain('["books"]');
    expect(keys).toContain('["stats"]');
    spy.mockRestore();
  });

  it('explains an unrecognized format', async () => {
    renderTransfer({ importAnswer: () => ({ status: 422, body: { error_code: 'validation', message: 'Could not recognize' } }) });
    await pick(csv());
    await userEvent.click(screen.getByRole('button', { name: 'Importa' }));
    expect(await screen.findByText(/Formato non riconosciuto o file non valido/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: "Rapporto dell'importazione" })).not.toBeInTheDocument();
  });

  it.each([
    [413, 'payload_too_large', 'Il contenuto inviato è troppo grande.'],
    [429, 'rate_limited', 'Troppi tentativi. Riprova tra poco.'],
  ])('shows the message for %s', async (status, code, text) => {
    renderTransfer({ importAnswer: () => ({ status, body: { error_code: code, message: 'x' } }) });
    await pick(csv());
    await userEvent.click(screen.getByRole('button', { name: 'Importa' }));
    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it('shows the network message', async () => {
    renderTransfer({ importAnswer: () => ({ status: 0, body: { error_code: 'network', message: 'x' } }) });
    await pick(csv());
    await userEvent.click(screen.getByRole('button', { name: 'Importa' }));
    expect(await screen.findByText(/Impossibile raggiungere il server/)).toBeInTheDocument();
  });
});

describe('export', () => {
  it.each([
    ['JSON', 'json', 'application/json', '{"books":[]}'],
    ['CSV', 'csv', 'text/csv', 'title\r\nDune\r\n'],
  ])('saves the %s export with its name, type and bytes', async (label, ext, mime, body) => {
    const { platform } = renderTransfer();
    await userEvent.click(await screen.findByRole('tab', { name: label }));
    await userEvent.click(screen.getByRole('button', { name: 'Esporta' }));
    await waitFor(() => expect(platform.saved).toHaveLength(1));
    const saved = platform.saved[0]!;
    expect(saved.suggestedName).toMatch(new RegExp(`^bookeeper-Casa Rossi-\\d{4}-\\d{2}-\\d{2}\\.${ext}$`));
    expect(saved.mime).toBe(mime);
    expect(new TextDecoder().decode(saved.bytes)).toBe(body);
    expect(platform.calls.some((c) => c.path.endsWith(`/export?format=${ext}`))).toBe(true);
    expect(await screen.findByText('File salvato')).toBeInTheDocument();
  });

  it('names the file after the local date', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 5, 12) });
    const { platform } = renderTransfer();
    const button = await screen.findByRole('button', { name: 'Esporta' });
    await userEvent.click(button);
    await waitFor(() => expect(platform.saved).toHaveLength(1));
    expect(platform.saved[0]!.suggestedName).toBe('bookeeper-Casa Rossi-2026-11-05.json');
  });

  it('treats a cancelled window as neither a toast nor an error', async () => {
    const { platform } = renderTransfer();
    platform.setSaveResult({ saved: false });
    await userEvent.click(await screen.findByRole('button', { name: 'Esporta' }));
    await waitFor(() => expect(platform.saved).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Esporta' })).toBeEnabled());
    expect(screen.queryByText('File salvato')).not.toBeInTheDocument();
    expect(screen.queryByText(/Qualcosa è andato storto/)).not.toBeInTheDocument();
  });
});

describe('visibility', () => {
  it('gives an owner both blocks', async () => {
    renderTransfer({ role: 'owner' });
    expect(await screen.findByRole('heading', { level: 2, name: 'Importa libri' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Esporta la libreria' })).toBeInTheDocument();
  });

  it('gives a member only the export', async () => {
    renderTransfer({ role: 'member' });
    expect(await screen.findByRole('heading', { level: 2, name: 'Esporta la libreria' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Importa libri' })).not.toBeInTheDocument();
  });

  it('hides the section from a guest', async () => {
    renderTransfer({ role: 'guest' });
    await screen.findByRole('link', { name: 'Aspetto' });
    expect(screen.queryByRole('link', { name: 'Import ed export' })).not.toBeInTheDocument();
  });
});
