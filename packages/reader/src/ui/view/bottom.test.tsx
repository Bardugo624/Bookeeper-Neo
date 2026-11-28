import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReaderLocale } from '../../i18n';
import { BottomBar, type BottomBarProps } from './BottomBar';

const chapterAt = (f: number) => (f > 0.5 ? 'Capitolo VIII' : 'Capitolo I');

function bar(props: Partial<BottomBarProps> = {}, locale: 'it' | 'en' = 'it') {
  const full: BottomBarProps = {
    layout: 'desktop',
    fraction: 0.04,
    ticks: [0.1, 0.2],
    chapterAt,
    onSeek: vi.fn(),
    times: { chapter: 9, book: 680 },
    question: null,
    jumpBack: null,
    ...props,
  };
  return { props: full, ...render(<ReaderLocale locale={locale}><BottomBar {...full} /></ReaderLocale>) };
}

function mockTrack() {
  const track = screen.getByRole('slider').querySelector('[data-track]') as HTMLElement;
  track.getBoundingClientRect = () => ({ left: 100, width: 400, top: 0, height: 6, right: 500, bottom: 6, x: 100, y: 0, toJSON() {} });
  return track;
}

function pointer(el: Element, type: string, clientX: number) {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX });
  Object.assign(ev, { pointerId: 1 });
  fireEvent(el, ev);
}

describe('BottomBar', () => {
  it('scrubbing_shows_the_chapter_and_jumps_on_release', () => {
    const { props } = bar();
    const track = mockTrack();
    expect(screen.queryByText(/Capitolo VIII ·/)).toBeNull();
    pointer(track, 'pointerdown', 100 + 0.21 * 400);
    expect(screen.getByText('Capitolo I · 21%')).toBeInTheDocument();
    pointer(track, 'pointermove', 100 + 0.6 * 400);
    expect(screen.getByText('Capitolo VIII · 60%')).toBeInTheDocument();
    expect(props.onSeek).not.toHaveBeenCalled();
    pointer(track, 'pointerup', 100 + 0.6 * 400);
    expect(props.onSeek).toHaveBeenCalledTimes(1);
    expect((props.onSeek as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBeCloseTo(0.6, 5);
    expect(screen.queryByText('Capitolo VIII · 60%')).toBeNull();
  });

  it('the_slider_announces_percent_and_chapter', () => {
    bar({ fraction: 0.04 });
    const slider = screen.getByRole('slider', { name: 'Avanzamento nel libro' });
    expect(slider).toHaveAttribute('aria-valuemin', '0');
    expect(slider).toHaveAttribute('aria-valuemax', '100');
    expect(slider).toHaveAttribute('aria-valuenow', '4');
    expect(slider).toHaveAttribute('aria-valuetext', '4%, Capitolo I');
  });

  it('the_slider_moves_with_the_keyboard_and_jumps_when_the_key_comes_up', async () => {
    const { props } = bar({ fraction: 0.5 });
    const slider = screen.getByRole('slider');
    slider.focus();
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(slider).toHaveAttribute('aria-valuenow', '51');
    expect(props.onSeek).not.toHaveBeenCalled();
    fireEvent.keyUp(slider, { key: 'ArrowRight' });
    expect((props.onSeek as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBeCloseTo(0.51, 5);
    fireEvent.keyDown(slider, { key: 'End' });
    fireEvent.keyUp(slider, { key: 'End' });
    expect((props.onSeek as ReturnType<typeof vi.fn>).mock.calls[1]![0]).toBe(1);
  });

  it('shows_percent_and_times', () => {
    bar();
    expect(screen.getByText('4%')).toBeInTheDocument();
    expect(screen.getByText(/9 min alla fine del capitolo/)).toBeInTheDocument();
    expect(screen.getByText(/11 h 20 min al libro/)).toBeInTheDocument();
  });

  it('omits_the_times_until_there_is_a_speed', () => {
    bar({ times: { chapter: null, book: null } });
    expect(screen.queryByText(/alla fine del capitolo/)).toBeNull();
    expect(screen.getByText('4%')).toBeInTheDocument();
  });

  it('the_question_replaces_the_progress_and_keeps_its_actions', async () => {
    const stay = vi.fn();
    const go = vi.fn();
    const { rerender, props } = bar({
      question: {
        text: 'Continua da dove eri sul telefono?',
        detail: '45% · Capitolo XVII · ieri alle 22:40',
        icon: 'phone',
        actions: [
          { id: 'stay', label: 'Resta qui', onClick: stay },
          { id: 'go', label: 'Vai al 45%', onClick: go, primary: true },
        ],
      },
    });
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.getByText('Continua da dove eri sul telefono?')).toBeInTheDocument();
    expect(screen.getByText(/ieri alle 22:40/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Resta qui' }));
    await userEvent.click(screen.getByRole('button', { name: 'Vai al 45%' }));
    expect(stay).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[aria-live="polite"]')).toContainElement(screen.getByText('Continua da dove eri sul telefono?'));
    rerender(<ReaderLocale locale="it"><BottomBar {...props} question={null} /></ReaderLocale>);
    expect(screen.getByRole('slider')).toBeInTheDocument();
    expect(screen.queryByText('Resta qui')).toBeNull();
  });

  it('jump_back_calls_back', async () => {
    const onBack = vi.fn();
    bar({ jumpBack: { percent: 4, onBack } });
    await userEvent.click(screen.getByRole('button', { name: 'Torna al 4%' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('is_translated', () => {
    bar({ jumpBack: { percent: 4, onBack: () => {} } }, 'en');
    expect(screen.getByRole('button', { name: 'Back to 4%' })).toBeInTheDocument();
    expect(screen.getByText(/9 min to the end of the chapter/)).toBeInTheDocument();
  });

  it('the_phone_has_its_four_buttons', async () => {
    const actions = { onToc: vi.fn(), onNotes: vi.fn(), onSearch: vi.fn(), onBookmark: vi.fn(), bookmarked: false };
    bar({ layout: 'phone', phone: actions });
    for (const name of ['Indice', 'Note', 'Cerca', 'Segna']) await userEvent.click(screen.getByRole('button', { name }));
    expect(actions.onToc).toHaveBeenCalled();
    expect(actions.onNotes).toHaveBeenCalled();
    expect(actions.onSearch).toHaveBeenCalled();
    expect(actions.onBookmark).toHaveBeenCalled();
    expect(screen.getByText(/9 min/)).toBeInTheDocument();
  });

  it('the_question_primary_action_is_filled', () => {
    bar({
      question: {
        text: 'Continua?',
        actions: [
          { id: 'stay', label: 'Resta qui', onClick: vi.fn() },
          { id: 'go', label: 'Vai al 45%', onClick: vi.fn(), primary: true },
        ],
      },
    });
    expect(screen.getByRole('button', { name: 'Vai al 45%' }).className).toMatch(/primary/i);
    expect(screen.getByRole('button', { name: 'Resta qui' }).className).not.toMatch(/(^|\s|_)primary/i);
  });
});
