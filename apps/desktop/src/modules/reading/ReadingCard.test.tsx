import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { reading, renderReading } from './testkit';

const puts = (view: { platform: { calls: Array<{ method: string; path: string; body?: unknown }> } }) =>
  view.platform.calls.filter((c) => c.method === 'PUT' && c.path.endsWith('/books/b1/reading'));
const card = async () => within(await screen.findByRole('region', { name: 'Lettura' }));

beforeEach(() => localStorage.clear());

describe('invitation', () => {
  it('offers the two ways in and "Start reading" sends status reading', async () => {
    const view = renderReading(null);
    const c = await card();
    expect(await c.findByText('Lo stai leggendo?')).toBeTruthy();
    await userEvent.click(c.getByRole('button', { name: 'Inizia a leggere' }));
    await waitFor(() => expect(puts(view)).toHaveLength(1));
    expect(puts(view)[0]!.body).toMatchObject({ status: 'reading' });
    expect(await c.findByText('In lettura')).toBeTruthy();
  });

  it('"To read" sends status to_read', async () => {
    const view = renderReading(null);
    await userEvent.click((await (await card()).findByRole('button', { name: 'Da leggere' })));
    await waitFor(() => expect(puts(view)[0]?.body).toMatchObject({ status: 'to_read' }));
  });
});

describe('ring', () => {
  it('shows 62% for page 312 of 503', async () => {
    renderReading(reading());
    const ring = await screen.findByRole('progressbar');
    expect(ring.getAttribute('aria-valuenow')).toBe('62');
    expect(within(ring).getByText('62%')).toBeTruthy();
    expect(screen.getByText('Pagina 312 di 503')).toBeTruthy();
  });

  it('shows no percentage without a total', async () => {
    renderReading(reading(), { books: [{ ...(await import('./testkit')).rosa(), page_count: null }] });
    const ring = await screen.findByRole('progressbar');
    expect(ring.textContent).not.toMatch('%');
    expect(ring.getAttribute('aria-label')).toBe('In lettura');
  });

  it('is full when the book is read', async () => {
    renderReading(reading({ status: 'read', finished_at: 1_700_100_000 }));
    expect((await screen.findByRole('progressbar')).getAttribute('aria-valuenow')).toBe('100');
  });
});

describe('page', () => {
  it('moves with more and less and saves with Enter', async () => {
    const view = renderReading(reading());
    const c = await card();
    await userEvent.click(await c.findByRole('button', { name: 'Una pagina in più' }));
    await waitFor(() => expect(puts(view)).toHaveLength(1));
    expect(puts(view)[0]!.body).toMatchObject({ status: 'reading', current_page: 313 });
    await userEvent.click(c.getByRole('button', { name: 'Una pagina in meno' }));
    await waitFor(() => expect(puts(view)).toHaveLength(2));
    expect(puts(view)[1]!.body).toMatchObject({ current_page: 312 });
    const field = c.getByRole('spinbutton', { name: 'Aggiorna la pagina' });
    await userEvent.clear(field);
    await userEvent.type(field, '400{Enter}');
    await waitFor(() => expect(puts(view)).toHaveLength(3));
    expect(puts(view)[2]!.body).toMatchObject({ current_page: 400 });
  });

  it('shows the core refusal beside the field and puts the page back', async () => {
    const view = renderReading(reading(), {
      refuse: () => ({ status: 422, body: { error_code: 'validation', message: 'current_page must not exceed page_count' } }),
    });
    const c = await card();
    const field = await c.findByRole('spinbutton', { name: 'Aggiorna la pagina' });
    await userEvent.clear(field);
    await userEvent.type(field, '900{Enter}');
    expect(await c.findByRole('alert')).toHaveProperty('textContent', 'current_page must not exceed page_count');
    await waitFor(() => expect((field as HTMLInputElement).value).toBe('312'));
    expect(puts(view)).toHaveLength(1);
  });
});

describe('rating', () => {
  it('moves with the arrows and clears', async () => {
    const view = renderReading(reading());
    const c = await card();
    const first = await c.findByRole('radio', { name: '1 su 5' });
    first.focus();
    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => expect(puts(view)).toHaveLength(1));
    expect(puts(view)[0]!.body).toMatchObject({ rating: 2 });
    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => expect(puts(view)).toHaveLength(2));
    expect(puts(view)[1]!.body).toMatchObject({ rating: 3 });
    expect(c.getByRole('radio', { name: '3 su 5' }).getAttribute('aria-checked')).toBe('true');
    await userEvent.click(c.getByRole('button', { name: 'Azzera la valutazione' }));
    await waitFor(() => expect(puts(view)).toHaveLength(3));
    expect(puts(view)[2]!.body).toMatchObject({ rating: null });
  });
});

describe('note', () => {
  it('saves once, when the field is left', async () => {
    const view = renderReading(reading());
    const c = await card();
    const note = await c.findByRole('textbox', { name: 'Nota' });
    await userEvent.type(note, 'Bello');
    expect(puts(view)).toHaveLength(0);
    await userEvent.tab();
    await waitFor(() => expect(puts(view)).toHaveLength(1));
    expect(puts(view)[0]!.body).toMatchObject({ note: 'Bello' });
    note.focus();
    await userEvent.tab();
    expect(puts(view)).toHaveLength(1);
  });

  it('counts characters past 1.800', async () => {
    renderReading(reading({ note: 'x'.repeat(1850) }));
    expect(await screen.findByText('1850 di 2000 caratteri')).toBeTruthy();
  });

  it('shows no counter below the threshold', async () => {
    renderReading(reading({ note: 'ciao' }));
    await screen.findByRole('textbox', { name: 'Nota' });
    expect(screen.queryByText(/caratteri/)).toBeNull();
  });
});

describe('status', () => {
  it('"Mark as read" sends read and then shows the date', async () => {
    const view = renderReading(reading());
    await userEvent.click(await screen.findByRole('button', { name: 'Segna come letto' }));
    await waitFor(() => expect(puts(view)).toHaveLength(1));
    expect(puts(view)[0]!.body).toMatchObject({ status: 'read' });
    expect(await screen.findByText(/^Letto il /)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Segna come letto' })).toBeNull();
  });

  it('"Remove status" sends DELETE', async () => {
    const view = renderReading(reading());
    const c = await card();
    await userEvent.click(await c.findByRole('button', { name: 'Cambia stato' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Togli dallo stato' }));
    await waitFor(() => expect(view.platform.calls.some((x) => x.method === 'DELETE' && x.path.endsWith('/books/b1/reading'))).toBe(true));
    expect(await c.findByText('Lo stai leggendo?')).toBeTruthy();
  });

  it('a guest, who cannot write books, still changes their own status', async () => {
    const view = renderReading(null, { role: 'guest' });
    expect(screen.queryByRole('button', { name: 'Modifica' })).toBeNull();
    await userEvent.click(await (await card()).findByRole('button', { name: 'Inizia a leggere' }));
    await waitFor(() => expect(puts(view)).toHaveLength(1));
  });
});

describe('p3 fixes', () => {
  it('does not save a note of only spaces over an empty one', async () => {
    const view = renderReading(reading());
    const note = await (await card()).findByRole('textbox', { name: 'Nota' });
    await userEvent.type(note, '   ');
    await userEvent.tab();
    expect(puts(view)).toHaveLength(0);
  });

  it('keeps the typed note in the field when the save fails', async () => {
    const view = renderReading(reading({ note: 'Prima' }), { refuse: () => ({ status: 500, body: { error_code: 'internal', message: 'boom' } }) });
    const note = await (await card()).findByRole('textbox', { name: 'Nota' });
    await userEvent.clear(note);
    await userEvent.type(note, 'Nuova');
    await userEvent.tab();
    await waitFor(() => expect(puts(view)).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 100));
    expect((note as HTMLTextAreaElement).value).toBe('Nuova');
  });

  it('hides "Mark as read" while the state failed to load', async () => {
    renderReading(reading(), { failGet: true });
    await screen.findByRole('region', { name: 'Lettura' });
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.queryByRole('button', { name: 'Segna come letto' })).toBeNull();
  });

  it('does not let the answer of an older save pull the page back', async () => {
    const releases: Array<() => void> = [];
    renderReading(reading(), { gate: () => new Promise<void>((r) => releases.push(r)) });
    const c = await card();
    const more = await c.findByRole('button', { name: 'Una pagina in più' });
    const field = c.getByRole('spinbutton', { name: 'Aggiorna la pagina' }) as HTMLInputElement;
    await userEvent.click(more);
    await waitFor(() => expect(field.value).toBe('313'));
    await userEvent.click(more);
    await waitFor(() => expect(field.value).toBe('314'));
    await waitFor(() => expect(releases).toHaveLength(2));
    releases[0]!();
    await new Promise((r) => setTimeout(r, 100));
    expect(field.value).toBe('314');
    releases[1]!();
    await new Promise((r) => setTimeout(r, 100));
    expect(field.value).toBe('314');
  });

  it('keeps the newer page when the answers come back in reverse order', async () => {
    const releases: Array<() => void> = [];
    renderReading(reading(), { gate: () => new Promise<void>((r) => releases.push(r)) });
    const c = await card();
    const more = await c.findByRole('button', { name: 'Una pagina in più' });
    const field = c.getByRole('spinbutton', { name: 'Aggiorna la pagina' }) as HTMLInputElement;
    await userEvent.click(more);
    await waitFor(() => expect(field.value).toBe('313'));
    await userEvent.click(more);
    await waitFor(() => expect(field.value).toBe('314'));
    await waitFor(() => expect(releases).toHaveLength(2));
    releases[1]!();
    await new Promise((r) => setTimeout(r, 100));
    expect(field.value).toBe('314');
    releases[0]!();
    await new Promise((r) => setTimeout(r, 100));
    expect(field.value).toBe('314');
  });

  it('writes the percentage through the translations', async () => {
    renderReading(reading());
    expect(await screen.findByText('62%')).toBeTruthy();
  });
});
