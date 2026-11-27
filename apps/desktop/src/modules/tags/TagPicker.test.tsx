import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { TAGS, renderPicker, tag } from './testkit';

const box = () => screen.findByRole('combobox', { name: 'Tag' });

describe('TagPicker', () => {
  it('searches the tags by name', async () => {
    renderPicker({ tags: [...TAGS] });
    await userEvent.type(await box(), 'fan');
    const list = await screen.findByRole('listbox');
    expect(within(list).getAllByRole('option')).toHaveLength(2); // Fantasy + "Crea «fan»"
    expect(within(list).getByRole('option', { name: /Fantasy/ })).toBeInTheDocument();
    expect(within(list).queryByRole('option', { name: /Classici/ })).toBeNull();
  });

  it('picks several tags from the keyboard and drops the last with Backspace', async () => {
    const { reported } = renderPicker({ tags: [...TAGS] });
    const input = await box();
    await userEvent.type(input, 'cla');
    await screen.findByRole('option', { name: /Classici/ });
    await userEvent.keyboard('{Enter}');
    await userEvent.type(input, 'fan');
    await userEvent.keyboard('{Enter}');
    expect(reported).toEqual([['t2'], ['t2', 't1']]);
    expect(screen.getByRole('button', { name: 'Rimuovi «Fantasy»' })).toBeInTheDocument();
    await userEvent.keyboard('{Backspace}');
    expect(reported.at(-1)).toEqual(['t2']);
  });

  it('closes only the list on Escape, before a document capture listener (dialog) sees it', async () => {
    renderPicker({ tags: [...TAGS] });
    const seen: string[] = [];
    const onDoc = (e: KeyboardEvent) => seen.push(e.key);
    document.addEventListener('keydown', onDoc, true);
    try {
      await userEvent.click(await box());
      await screen.findByRole('listbox');
      await userEvent.keyboard('{Escape}');
      expect(screen.queryByRole('listbox')).toBeNull();
      expect(seen).not.toContain('Escape');
    } finally {
      document.removeEventListener('keydown', onDoc, true);
    }
  });

  it('closes the list only after the focus has landed on the next control', async () => {
    renderPicker({ tags: [...TAGS] });
    await userEvent.click(await box());
    const list = await screen.findByRole('listbox');
    const next = document.createElement('button');
    document.body.append(next);
    try {
      // In a modal dialog, removing nodes while the focus is between two elements makes the focus trap pull it back.
      fireEvent.blur(await box(), { relatedTarget: next });
      expect(list).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    } finally {
      next.remove();
    }
  });

  it('moves with the arrows and picks the active option', async () => {
    const { reported } = renderPicker({ tags: [...TAGS] });
    await userEvent.click(await box());
    await screen.findByRole('listbox');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(reported).toEqual([['t3']]);
  });

  it('creates a tag on the fly with the chosen color and picks it', async () => {
    const { platform, reported } = renderPicker({ tags: [...TAGS] });
    await userEvent.type(await box(), 'Gialli');
    expect(await screen.findByRole('option', { name: 'Crea «Gialli»' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Ambra' }));
    await userEvent.click(screen.getByRole('option', { name: 'Crea «Gialli»' }));
    await waitFor(() => expect(reported).toHaveLength(1));
    const post = platform.calls.find((c) => c.method === 'POST' && c.path === '/api/v1/tags');
    expect(post?.body).toEqual({ name: 'Gialli', color: 'amber' });
    expect(reported[0]).toHaveLength(1);
    expect(await screen.findByRole('button', { name: 'Rimuovi «Gialli»' })).toBeInTheDocument();
  });

  it('does not offer to create a name that exists, whatever the case', async () => {
    renderPicker({ tags: [...TAGS] });
    await userEvent.type(await box(), ' FANTASY ');
    await screen.findByRole('option', { name: /Fantasy/ });
    expect(screen.queryByRole('option', { name: /Crea/ })).toBeNull();
  });

  it('shows the message of the core when the name was taken meanwhile', async () => {
    const state = { tags: [...TAGS] };
    const { reported } = renderPicker(state);
    const input = await box();
    await screen.findByRole('combobox');
    // The tag appears on the server after the picker has read the list.
    state.tags = [...state.tags, tag('t9', 'Gialli')];
    await userEvent.type(input, 'Gialli');
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByText('Esiste già un tag con questo nome.')).toBeInTheDocument();
    expect(reported).toEqual([]);
  });

  it('stops at 20 tags', async () => {
    const many = Array.from({ length: 21 }, (_, i) => tag(`x${i}`, `Tag ${String(i).padStart(2, '0')}`));
    const { reported, platform } = renderPicker({ tags: many }, many.slice(0, 20).map((x) => x.id));
    const input = await box();
    expect(await screen.findByText('Hai raggiunto il limite di 20 tag.')).toBeInTheDocument();
    await userEvent.type(input, 'Tag 20');
    const last = await screen.findByRole('option', { name: /Tag 20/ });
    expect(last).toHaveAttribute('aria-disabled', 'true');
    await userEvent.keyboard('{Enter}');
    await userEvent.clear(input);
    await userEvent.type(input, 'Nuovo');
    await userEvent.click(await screen.findByRole('option', { name: 'Crea «Nuovo»' }));
    expect(reported).toEqual([]);
    expect(platform.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    // A chosen tag can still be removed.
    await userEvent.click(screen.getByRole('button', { name: 'Rimuovi «Tag 00»' }));
    expect(reported[0]).toHaveLength(19);
  });
});
