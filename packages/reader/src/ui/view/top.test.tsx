import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReaderLocale } from '../../i18n';
import { TopBar, type TopBarProps } from './TopBar';

function top(props: Partial<TopBarProps> = {}) {
  const full: TopBarProps = {
    layout: 'desktop',
    title: 'I promessi sposi',
    chapter: 'Capitolo I',
    onBack: vi.fn(),
    onSearch: vi.fn(),
    onBookmark: vi.fn(),
    bookmarked: false,
    onAppearance: vi.fn(),
    onPanel: vi.fn(),
    panelOpen: false,
    ...props,
  };
  render(<ReaderLocale locale="it"><TopBar {...full} /></ReaderLocale>);
  return full;
}

describe('TopBar', () => {
  it('the_desktop_top_bar_is_a_drag_region_with_a_slot_for_window_controls', () => {
    top({ topEnd: <button>Chiudi finestra</button> });
    const bar = screen.getByRole('banner');
    expect(bar).toHaveAttribute('data-tauri-drag-region');
    for (const b of screen.getAllByRole('button')) expect(b).not.toHaveAttribute('data-tauri-drag-region');
    const slot = bar.querySelector('[data-slot="top-end"]')!;
    expect(slot).not.toHaveAttribute('data-tauri-drag-region');
    expect(slot).toContainElement(screen.getByText('Chiudi finestra'));
    expect(screen.getByText('I promessi sposi').closest('[data-tauri-drag-region]')).not.toBeNull();
  });

  it('the_phone_bar_is_not_a_drag_region_and_has_back_title_aa_and_more', () => {
    top({ layout: 'phone', moreItems: [{ id: 'x', label: 'Apri la scheda del libro', onSelect: () => {} }] });
    expect(screen.getByRole('banner')).not.toHaveAttribute('data-tauri-drag-region');
    for (const name of ['Indietro', 'Aspetto', 'Altro']) expect(screen.getByRole('button', { name })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerca' })).toBeNull();
    expect(screen.getByText('I promessi sposi')).toBeInTheDocument();
  });

  it('shows_the_title_and_the_chapter_and_calls_back', async () => {
    const p = top();
    expect(screen.getByText(/Capitolo I/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Indietro' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cerca' }));
    await userEvent.click(screen.getByRole('button', { name: 'Aggiungi segnalibro' }));
    await userEvent.click(screen.getByRole('button', { name: 'Aspetto' }));
    await userEvent.click(screen.getByRole('button', { name: 'Pannello' }));
    for (const f of [p.onBack, p.onSearch, p.onBookmark, p.onAppearance, p.onPanel]) expect(f).toHaveBeenCalledTimes(1);
  });

  it('the_bookmark_is_filled_when_active_and_the_panel_says_if_it_is_open', () => {
    top({ bookmarked: true, panelOpen: true });
    const bookmark = screen.getByRole('button', { name: 'Togli il segnalibro' });
    expect(bookmark.querySelector('svg')).toHaveAttribute('fill', 'currentColor');
    expect(screen.getByRole('button', { name: 'Pannello' })).toHaveAttribute('aria-expanded', 'true');
  });
});
