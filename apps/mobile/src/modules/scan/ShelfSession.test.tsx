import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { FakePlatform } from '../../platform/testing';
import { CODES, owned, shelfPlatform, world, type ShelfWorld } from './shelfKit';
import { meta, renderScan, type Server } from './testkit';

const puts = (platform: FakePlatform) =>
  platform.fake.calls.filter((c) => c.method === 'PUT' && c.path.endsWith('/placement'));
const read = (platform: FakePlatform, text: string) => act(() => platform.scanner.emit({ text, format: 'ean_13' }));
const counter = () => screen.getByRole('status', { name: 'Libri collocati' });

async function begin(w: ShelfWorld, s: Server = {}) {
  const user = userEvent.setup();
  const { platform } = shelfPlatform(w, s);
  renderScan(platform, '/scan/shelf');
  await user.click(await screen.findByRole('button', { name: /Libreria/ }));
  await user.click(await screen.findByRole('button', { name: /Ripiano 1/ }));
  await screen.findByText('Inquadra il codice a barre sul retro del libro');
  return { user, platform };
}

describe('three books in sequence', () => {
  it('places a known one, notes one already here, adds a new one, undoes, and sums up', async () => {
    const w = world();
    owned(w, 1); // not placed
    owned(w, 2, { shelf_id: 's1', row_index: 0, slot_index: 0 });
    const { user, platform } = await begin(w, { lookup: meta({ title: 'Emma' }) });
    expect(screen.getByText('Libreria, ripiano 1')).toBeInTheDocument();

    read(platform, CODES[0]!);
    expect(await screen.findByText('Libro 1 · posto 2')).toBeInTheDocument();
    expect(counter()).toHaveTextContent('1 libro collocato');
    expect(puts(platform)[0]?.body).toEqual({ shelf_id: 's1', row_index: 0 });

    read(platform, CODES[1]!);
    expect(await screen.findByText('Libro 2 è già qui · posto 1')).toBeInTheDocument();
    expect(puts(platform)).toHaveLength(1);

    read(platform, CODES[2]!);
    expect(await screen.findByText('Emma aggiunto · posto 3')).toBeInTheDocument();
    expect(counter()).toHaveTextContent('2 libri collocati');
    expect(platform.fake.calls.filter((c) => c.method === 'POST' && c.path === '/api/v1/books')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: "Annulla l'ultimo" }));
    expect(await screen.findByText('Annullato: Emma')).toBeInTheDocument();
    expect(w.deleted).toHaveLength(1);
    expect(w.deleted[0]).toMatch(/^n/);
    expect(screen.getByRole('button', { name: "Annulla l'ultimo" })).toBeDisabled();
    expect(counter()).toHaveTextContent('1 libro collocato');

    await user.click(screen.getByRole('button', { name: 'Ho finito' }));
    expect(await screen.findByRole('heading', { name: 'Riepilogo' })).toBeInTheDocument();
    expect(screen.getByText('1 collocato')).toBeInTheDocument();
    expect(screen.getByText('0 spostati')).toBeInTheDocument();
    expect(screen.getByText('0 aggiunti')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: "Libri nell'ordine di scansione" });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Un altro ripiano' }));
    expect(await screen.findByText('Scegli il mobile da riempire.')).toBeInTheDocument();
  });

  it('closes to the scan page', async () => {
    const { user } = await begin(world());
    await user.click(screen.getByRole('button', { name: 'Ho finito' }));
    await user.click(await screen.findByRole('button', { name: 'Chiudi' }));
    expect(await screen.findByRole('button', { name: 'Riempi un ripiano' })).toBeInTheDocument();
  });
});

describe('undo', () => {
  it('puts a moved book back where it was, and a newly placed one back to unplaced', async () => {
    const w = world();
    owned(w, 1, { shelf_id: 's1', row_index: 1, slot_index: 2 });
    owned(w, 2);
    const { user, platform } = await begin(w);

    read(platform, CODES[0]!);
    expect(await screen.findByText('Libro 1 · posto 1, spostato da Libreria, ripiano 2')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Libri collocati' })).toHaveTextContent('1 libro collocato');
    await user.click(screen.getByRole('button', { name: "Annulla l'ultimo" }));
    await screen.findByText('Annullato: Libro 1');
    expect(w.placed['b1']).toEqual({ shelf_id: 's1', row_index: 1, slot_index: 2 });

    read(platform, CODES[1]!);
    await screen.findByText('Libro 2 · posto 1');
    await user.click(screen.getByRole('button', { name: "Annulla l'ultimo" }));
    await screen.findByText('Annullato: Libro 2');
    expect(w.placed['b2']).toBeUndefined();
    expect(platform.fake.calls.some((c) => c.method === 'DELETE' && c.path === '/api/v1/books/b2/placement')).toBe(true);
  });
});

describe('codes', () => {
  it('ignores the same code read twice in a row', async () => {
    const w = world();
    owned(w, 1);
    const { platform } = await begin(w);
    read(platform, CODES[0]!);
    read(platform, CODES[0]!);
    await screen.findByText('Libro 1 · posto 1');
    read(platform, CODES[0]!);
    await waitFor(() => expect(puts(platform)).toHaveLength(1));
  });

  it('takes the ISBN typed by hand', async () => {
    const w = world();
    owned(w, 1);
    const { user } = await begin(w);
    await user.click(screen.getByRole('button', { name: "Scrivi l'ISBN a mano" }));
    await user.type(screen.getByLabelText('ISBN'), `${CODES[0]}{Enter}`);
    expect(await screen.findByText('Libro 1 · posto 1')).toBeInTheDocument();
  });
});

describe('a book nothing is known about', () => {
  it('skips it', async () => {
    const { user, platform } = await begin(world());
    read(platform, CODES[3]!);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Salta' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(counter()).toHaveTextContent('0 libri collocati');
    expect(platform.fake.calls.some((c) => c.method === 'POST' && c.path === '/api/v1/books')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Ho finito' }));
    expect(await screen.findByText('1 saltato')).toBeInTheDocument();
  });

  it('asks for the title, then creates and places it', async () => {
    const { user, platform } = await begin(world());
    read(platform, CODES[3]!);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Inserisci il titolo' }));
    await user.click(within(dialog).getByRole('button', { name: 'Crea e colloca' }));
    expect(await within(dialog).findByText('Scrivi il titolo del libro.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Titolo'), 'Senza nome');
    await user.type(within(dialog).getByLabelText('Autore (facoltativo)'), 'A. Nonimo');
    await user.click(within(dialog).getByRole('button', { name: 'Crea e colloca' }));
    expect(await screen.findByText('Senza nome aggiunto · posto 1')).toBeInTheDocument();
    const post = platform.fake.calls.find((c) => c.method === 'POST' && c.path === '/api/v1/books');
    expect(post?.body).toMatchObject({ title: 'Senza nome', isbn_13: CODES[3], authors: ['A. Nonimo'] });
  });
});

describe('end of the row and the network', () => {
  it('stops with "the shelf is full" and goes to the summary', async () => {
    const w = world();
    for (let i = 0; i < 3; i += 1) owned(w, i + 1, { shelf_id: 's1', row_index: 0, slot_index: i });
    owned(w, 4);
    owned(w, 5);
    const { platform } = await begin(w);
    read(platform, CODES[3]!);
    await screen.findByText('Libro 4 · posto 4');
    read(platform, CODES[4]!);
    expect(await screen.findByText('Il ripiano è pieno')).toBeInTheDocument();
    expect(screen.getByText('1 collocato')).toBeInTheDocument();
  });

  it('a failed step is not counted, offers retry for that code, and the session goes on', async () => {
    const w = world();
    owned(w, 1);
    owned(w, 2);
    w.failNext = [{ status: 500, code: 'boom' }];
    const { user, platform } = await begin(w);
    read(platform, CODES[0]!);
    const alert = (await screen.findByText(`Non è andata a buon fine per l'ISBN ${CODES[0]}.`)).parentElement!;
    expect(alert).toHaveAttribute('role', 'alert');
    expect(counter()).toHaveTextContent('0 libri collocati');
    await user.click(within(alert).getByRole('button', { name: 'Riprova' }));
    expect(await screen.findByText('Libro 1 · posto 1')).toBeInTheDocument();
    expect(counter()).toHaveTextContent('1 libro collocato');
    read(platform, CODES[1]!);
    expect(await screen.findByText('Libro 2 · posto 2')).toBeInTheDocument();
  });
});
