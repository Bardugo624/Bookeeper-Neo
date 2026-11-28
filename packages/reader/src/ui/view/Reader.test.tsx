import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { THEME_COLORS } from '../../model';
import { ReaderLocale } from '../../i18n';
import { Reader } from './Reader';
import { Sheet } from './Sheet';

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
});
