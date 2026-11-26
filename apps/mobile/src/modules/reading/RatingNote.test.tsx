import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { puts, reading, renderBlock } from './testkit';

beforeEach(() => localStorage.clear());
const block = async () => within(await screen.findByRole('region', { name: 'Lettura' }));
const done = (over = {}) => reading({ status: 'read', finished_at: 1_700_100_000, ...over });
const refuse = { status: 500, body: { error_code: 'internal', message: 'x' } };

describe('stars', () => {
  it('are only for read or abandoned books', async () => {
    renderBlock({ current: reading() });
    const b = await block();
    await b.findByText('In lettura');
    expect(b.queryByRole('radiogroup')).toBeNull();
  });

  it('choose a rating, and touching the chosen star removes it', async () => {
    const view = renderBlock({ current: done() });
    const b = await block();
    await userEvent.click(await b.findByRole('radio', { name: '4 su 5' }));
    await waitFor(() => expect(puts(view.platform.fake.calls)).toHaveLength(1));
    expect(puts(view.platform.fake.calls)[0]!.body).toMatchObject({ rating: 4 });
    await waitFor(() => expect(b.getByRole('radio', { name: '4 su 5' }).getAttribute('aria-checked')).toBe('true'));
    await userEvent.click(b.getByRole('radio', { name: '4 su 5' }));
    await waitFor(() => expect(puts(view.platform.fake.calls)).toHaveLength(2));
    expect(puts(view.platform.fake.calls)[1]!.body).toMatchObject({ rating: null });
  });
});

describe('note', () => {
  it('saves on leaving the field', async () => {
    const view = renderBlock({ current: done() });
    const field = await (await block()).findByRole('textbox', { name: 'Nota' });
    await userEvent.type(field, 'Bellissimo');
    expect(puts(view.platform.fake.calls)).toHaveLength(0);
    await userEvent.tab();
    await waitFor(() => expect(puts(view.platform.fake.calls)).toHaveLength(1));
    expect(puts(view.platform.fake.calls)[0]!.body).toMatchObject({ note: 'Bellissimo' });
  });

  it('does not save when unchanged', async () => {
    const view = renderBlock({ current: done({ note: 'Già scritta' }) });
    const field = await (await block()).findByRole('textbox', { name: 'Nota' });
    await userEvent.click(field);
    await userEvent.tab();
    expect(puts(view.platform.fake.calls)).toHaveLength(0);
  });

  it('does not save spaces only', async () => {
    const view = renderBlock({ current: done() });
    const field = await (await block()).findByRole('textbox', { name: 'Nota' });
    await userEvent.type(field, '   ');
    await userEvent.tab();
    expect(puts(view.platform.fake.calls)).toHaveLength(0);
  });

  it('keeps the text in the field when saving fails', async () => {
    renderBlock({ current: done(), put: () => refuse });
    const b = await block();
    const field = await b.findByRole('textbox', { name: 'Nota' });
    await userEvent.type(field, 'Da non perdere');
    await userEvent.tab();
    expect(await b.findByRole('alert')).toBeTruthy();
    expect((field as HTMLTextAreaElement).value).toBe('Da non perdere');
  });
});
