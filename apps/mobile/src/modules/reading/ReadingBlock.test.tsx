import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { puts, reading, renderBlock, type ReadingServer } from './testkit';

beforeEach(() => localStorage.clear());
const block = async () => within(await screen.findByRole('region', { name: 'Lettura' }));
const calls = (view: ReturnType<typeof renderBlock>) => view.platform.fake.calls;
const refuse = { status: 500, body: { error_code: 'internal', message: 'x' } };

describe('without a state', () => {
  it.each([
    ['Da leggere', 'to_read'],
    ['Sto leggendo', 'reading'],
    ['Letto', 'read'],
  ])('"%s" sends %s', async (label, status) => {
    const view = renderBlock({ current: null });
    await userEvent.click(await (await block()).findByRole('button', { name: label }));
    await waitFor(() => expect(puts(calls(view))).toHaveLength(1));
    expect(puts(calls(view))[0]!.body).toMatchObject({ status });
  });
});

describe('refused first choice', () => {
  it('puts the choices back and says why', async () => {
    renderBlock({ current: null, put: () => refuse });
    const b = await block();
    await userEvent.click(await b.findByRole('button', { name: 'Sto leggendo' }));
    expect(await b.findByRole('alert')).toBeTruthy();
    expect(await b.findByRole('button', { name: 'Letto' })).toBeTruthy();
  });
});

describe('with a state', () => {
  it('shows the ring with the percent, the page and the start date', async () => {
    renderBlock({ current: reading() });
    const b = await block();
    const ring = await b.findByRole('progressbar');
    expect(ring.getAttribute('aria-valuenow')).toBe('62');
    expect(b.getByText('Pagina 312 di 503')).toBeTruthy();
    expect(b.getByText(/^Iniziato il /)).toBeTruthy();
  });

  it('draws no ring without the number of pages', async () => {
    renderBlock({ current: reading() }, { page_count: null });
    const b = await block();
    await b.findByText('In lettura');
    expect(b.queryByRole('progressbar')).toBeNull();
  });

  it('changes the status from the sheet', async () => {
    const server: ReadingServer = { current: reading() };
    const view = renderBlock(server);
    await userEvent.click(await (await block()).findByRole('button', { name: 'Cambia stato' }));
    const sheet = within(await screen.findByRole('dialog'));
    expect(sheet.getByRole('button', { name: 'In lettura' }).getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(sheet.getByRole('button', { name: 'Abbandonato' }));
    await waitFor(() => expect(puts(calls(view))).toHaveLength(1));
    expect(puts(calls(view))[0]!.body).toMatchObject({ status: 'abandoned' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('puts the clearing option last, after a divider', async () => {
    renderBlock({ current: reading() });
    await userEvent.click(await (await block()).findByRole('button', { name: 'Cambia stato' }));
    const sheet = within(await screen.findByRole('dialog'));
    const items = sheet.getAllByRole('listitem', { hidden: true });
    expect(items[items.length - 2]!.querySelector('[role="separator"]')).not.toBeNull();
    expect(items[items.length - 1]!.textContent).toBe('Togli lo stato');
  });

  it('removes the state', async () => {
    const view = renderBlock({ current: reading() });
    await userEvent.click(await (await block()).findByRole('button', { name: 'Cambia stato' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Togli lo stato' }));
    await waitFor(() => expect(calls(view).some((c) => c.method === 'DELETE')).toBe(true));
    expect(await (await block()).findByRole('button', { name: 'Sto leggendo' })).toBeTruthy();
  });

  it('keeps the state and says why when removing it is refused', async () => {
    renderBlock({ current: reading(), failDelete: true });
    const b = await block();
    await userEvent.click(await b.findByRole('button', { name: 'Cambia stato' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Togli lo stato' }));
    expect(await b.findByRole('alert')).toBeTruthy();
    expect(await b.findByText('In lettura')).toBeTruthy();
  });

  it('"Mark as read" sends read', async () => {
    const view = renderBlock({ current: reading() });
    await userEvent.click(await (await block()).findByRole('button', { name: 'Segna come letto' }));
    await waitFor(() => expect(puts(calls(view))[0]?.body).toMatchObject({ status: 'read' }));
  });

  it('puts the old state back and says why when a change is refused', async () => {
    renderBlock({ current: reading(), put: () => refuse });
    const b = await block();
    await userEvent.click(await b.findByRole('button', { name: 'Segna come letto' }));
    expect(await b.findByRole('alert')).toBeTruthy();
    expect(await b.findByText('In lettura')).toBeTruthy();
  });
});

describe('load error', () => {
  it('offers retry and no write control', async () => {
    const server: ReadingServer = { current: null, failGet: true };
    renderBlock(server);
    const b = await block();
    expect(await b.findByRole('button', { name: 'Riprova' })).toBeTruthy();
    expect(b.queryByRole('button', { name: 'Da leggere' })).toBeNull();
    expect(b.queryByRole('button', { name: 'Cambia stato' })).toBeNull();
    expect(b.queryByRole('radio')).toBeNull();
    expect(b.queryByRole('textbox')).toBeNull();
    server.failGet = false;
    await userEvent.click(b.getByRole('button', { name: 'Riprova' }));
    expect(await b.findByRole('button', { name: 'Da leggere' })).toBeTruthy();
  });
});
