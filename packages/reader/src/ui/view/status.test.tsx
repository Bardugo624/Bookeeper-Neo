import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReaderLocale } from '../../i18n';
import { ReaderStatus, type ReaderStatusProps } from './ReaderStatus';

const show = (props: ReaderStatusProps, locale: 'it' | 'en' = 'it') =>
  render(<ReaderLocale locale={locale}><ReaderStatus {...props} /></ReaderLocale>);

describe('ReaderStatus', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('loading_shows_after_300_ms_only', () => {
    show({ kind: 'loading', cover: <div role="img" aria-label="Copertina" /> });
    expect(screen.queryByText('Apro il libro…')).toBeNull();
    act(() => vi.advanceTimersByTime(299));
    expect(screen.queryByText('Apro il libro…')).toBeNull();
    act(() => vi.advanceTimersByTime(2));
    expect(screen.getByText('Apro il libro…')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Copertina' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('a_book_that_opens_before_300_ms_never_shows_it', () => {
    const { unmount } = show({ kind: 'loading' });
    act(() => vi.advanceTimersByTime(200));
    unmount();
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByText('Apro il libro…')).toBeNull();
  });

  it.each([
    ['open_failed', 'Questo file non si apre', 'Scarica il file'],
    ['missing', 'Il file manca sul server', 'Torna alla scheda del libro'],
    ['offline', 'Sei offline e questo libro non è sul telefono', 'Torna alla scheda del libro'],
  ] as const)('errors_show_the_message_and_the_action (%s)', async (error, message, action) => {
    vi.useRealTimers();
    const onAction = vi.fn();
    show({ kind: 'error', error, onAction });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: message })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: action }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('errors_are_translated', () => {
    vi.useRealTimers();
    show({ kind: 'error', error: 'open_failed', onAction: () => {} }, 'en');
    expect(screen.getByRole('button', { name: 'Download the file' })).toBeInTheDocument();
  });

  it('phone_targets_are_at_least_44_by_48', () => {
    const read = (name: string) => readFileSync(`${process.cwd()}/src/ui/view/${name}`, 'utf8');
    const status = read('ReaderStatus.module.css');
    const coarse = status.slice(status.indexOf('@media (pointer: coarse)'));
    expect(coarse).toMatch(/\.action\s*{[^}]*min-width:\s*44px[^}]*min-height:\s*48px/s);
    const sheet = read('Sheet.css');
    expect(sheet).toMatch(/> header > button\s*{[^}]*width:\s*44px[^}]*height:\s*48px/s);
  });
});
