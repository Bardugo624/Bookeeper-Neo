import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { THEME_COLORS } from '../../model';
import { ReaderLocale } from '../../i18n';
import { Reader } from './Reader';
import { Sheet } from './Sheet';

/** jsdom has no PointerEvent: a MouseEvent with the pointer's type carries `clientY`. */
function pointer(type: string, el: Element, init: { clientY?: number; pointerId?: number }) {
  fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, clientY: init.clientY ?? 0 }));
}

const base = { chromeVisible: true, progress: 0.25, top: <header>top</header>, bottom: <footer>bottom</footer> };

describe('Reader', () => {
  it('lays_out_bars_page_panel_and_overlays_and_applies_the_theme', () => {
    const { container } = render(
      <ReaderLocale locale="it">
        <Reader {...base} layout="desktop" theme="sepia" panelOpen panel={<div>pannello</div>} overlays={<div>finestrella</div>}>
          <iframe title="page" />
        </Reader>
      </ReaderLocale>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.getPropertyValue('--rd-page')).toBe(THEME_COLORS.sepia.page);
    expect(screen.getByTitle('page')).toBeInTheDocument();
    for (const t of ['top', 'bottom', 'pannello', 'finestrella']) expect(screen.getByText(t)).toBeInTheDocument();
  });

  it('hidden_bars_leave_a_thin_line_and_do_not_take_focus', () => {
    render(
      <ReaderLocale locale="it">
        <Reader {...base} chromeVisible={false} layout="desktop" theme="light"><iframe title="page" /></Reader>
      </ReaderLocale>,
    );
    expect(document.querySelector('[data-bar="top"]')).toHaveAttribute('data-visible', 'false');
    expect(document.querySelector('[data-bar="top"]')).toHaveAttribute('inert');
    expect(document.querySelector('[data-line]')).toHaveAttribute('data-visible', 'true');
    expect((document.querySelector('[data-line]')!.parentElement!.parentElement as HTMLElement).style.getPropertyValue('--rd-progress')).toBe('0.25');
  });

  it('the_panel_slot_is_empty_while_closed', () => {
    render(
      <ReaderLocale locale="it">
        <Reader {...base} layout="desktop" theme="light" panel={<div>pannello</div>}><iframe title="page" /></Reader>
      </ReaderLocale>,
    );
    expect(screen.queryByText('pannello')).toBeNull();
  });
});

describe('Sheet', () => {
  it('opens_a_dialog_with_the_title_and_marks_the_page_while_open', () => {
    const { rerender } = render(
      <ReaderLocale locale="it">
        <Sheet open onOpenChange={() => {}} title="Note">contenuto</Sheet>
      </ReaderLocale>,
    );
    expect(screen.getByRole('dialog', { name: 'Note' })).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('data-reader-sheet');
    rerender(<ReaderLocale locale="it"><Sheet open={false} onOpenChange={() => {}} title="Note">contenuto</Sheet></ReaderLocale>);
    expect(document.documentElement).not.toHaveAttribute('data-reader-sheet');
  });

  it('marks_its_own_dialog_even_with_another_dialog_on_the_page', () => {
    render(
      <ReaderLocale locale="it">
        <div role="dialog" aria-label="altro" />
        <Sheet open onOpenChange={() => {}} title="Note">contenuto</Sheet>
        <div role="dialog" aria-label="dopo" />
      </ReaderLocale>,
    );
    expect(screen.getByRole('dialog', { name: 'Note' })).toHaveAttribute('data-reader-sheet-dialog');
    expect(screen.getByRole('dialog', { name: 'altro', hidden: true })).not.toHaveAttribute('data-reader-sheet-dialog');
    expect(screen.getByRole('dialog', { name: 'dopo', hidden: true })).not.toHaveAttribute('data-reader-sheet-dialog');
  });

  it('a_press_on_the_close_button_is_not_a_pull_and_closes_the_sheet', () => {
    const onOpenChange = vi.fn();
    render(
      <ReaderLocale locale="it">
        <Sheet open onOpenChange={onOpenChange} title="Note">contenuto</Sheet>
      </ReaderLocale>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Note' });
    const capture = vi.fn();
    dialog.setPointerCapture = capture;
    const close = screen.getByRole('button', { name: 'Chiudi' });
    pointer('pointerdown', close, { clientY: 0, pointerId: 1 });
    expect(capture).not.toHaveBeenCalled();
    fireEvent.click(close);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('pulling_the_top_band_raises_the_sheet', () => {
    render(
      <ReaderLocale locale="it">
        <Sheet open onOpenChange={() => {}} title="Note">contenuto</Sheet>
      </ReaderLocale>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Note' });
    dialog.setPointerCapture = vi.fn();
    dialog.getBoundingClientRect = () => ({ top: 300, height: 500, bottom: 800, left: 0, right: 390, width: 390, x: 0, y: 300, toJSON: () => ({}) });
    pointer('pointerdown', dialog, { clientY: 310, pointerId: 1 });
    expect(dialog.setPointerCapture).toHaveBeenCalled();
    pointer('pointermove', dialog, { clientY: 210, pointerId: 1 });
    expect(dialog.style.getPropertyValue('--reader-sheet-h')).toBe(`${Math.min(window.innerHeight, 600)}px`);
    pointer('pointerup', dialog, { pointerId: 1 });
    pointer('pointermove', dialog, { clientY: 100, pointerId: 1 });
    expect(dialog.style.getPropertyValue('--reader-sheet-h')).toBe(`${Math.min(window.innerHeight, 600)}px`);
  });
});
