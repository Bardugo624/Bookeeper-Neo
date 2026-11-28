import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Sheet } from '../view/Sheet';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReaderLocale } from '../../i18n';
import { DEFAULT_SETTINGS, type ReaderSettings } from '../../model';
import { THEME_COLORS } from '../../model/themeColors';
import { AppearancePanel, type AppearancePanelProps } from './AppearancePanel';

function panel(props: Partial<AppearancePanelProps> = {}, settings: Partial<ReaderSettings> = {}) {
  const full: AppearancePanelProps = {
    open: true,
    onOpenChange: vi.fn(),
    layout: 'desktop',
    format: 'epub',
    settings: { ...DEFAULT_SETTINGS, ...settings },
    onChange: vi.fn(),
    trigger: <button>Aa</button>,
    ...props,
  };
  render(
    <ReaderLocale locale="it">
      <AppearancePanel {...full} />
    </ReaderLocale>,
  );
  return full;
}

const last = (p: AppearancePanelProps) => vi.mocked(p.onChange).mock.lastCall![0];

describe('AppearancePanel', () => {
  it('every_row_changes_the_settings', async () => {
    const user = userEvent.setup();
    const p = panel();
    await user.click(screen.getByRole('radio', { name: 'Seppia' }));
    expect(last(p)).toEqual({ ...DEFAULT_SETTINGS, theme: 'sepia' });
    await user.click(screen.getByRole('radio', { name: 'Inter' }));
    expect(last(p).font).toBe('inter');
    await user.click(screen.getByRole('button', { name: 'Più grande' }));
    expect(last(p).fontSize).toBe(19);
    await user.click(screen.getByRole('button', { name: 'Più piccolo' }));
    expect(last(p).fontSize).toBe(17);
    await user.click(screen.getByRole('radio', { name: '1,8' }));
    expect(last(p).lineHeight).toBe(1.8);
    await user.click(screen.getByRole('radio', { name: 'Ampi' }));
    expect(last(p).margins).toBe('wide');
    await user.click(screen.getByRole('radio', { name: 'Scorrimento' }));
    expect(last(p).flow).toBe('scrolled');
    await user.click(screen.getByRole('switch', { name: "Due pagine quando c'è spazio" }));
    expect(last(p).twoPages).toBe(false);
    await user.click(screen.getByRole('switch', { name: 'Giustifica il testo' }));
    expect(last(p).justify).toBe(false);
    await user.click(screen.getByRole('switch', { name: 'Sillabazione' }));
    expect(last(p).hyphenate).toBe(false);
    await user.click(screen.getByRole('switch', { name: "Stili dell'editore" }));
    expect(last(p).publisherStyles).toBe(false);
  });

  it('keeps the size inside 12 to 32', async () => {
    const user = userEvent.setup();
    panel({}, { fontSize: 32 });
    expect(screen.getByRole('button', { name: 'Più grande' })).toBeDisabled();
  });

  it('font_names_use_their_face', () => {
    panel();
    const face = (name: string) => screen.getByRole('radio', { name }).style.fontFamily;
    expect(face('Lora')).toContain('Lora Variable');
    expect(face('Inter')).toContain('Inter Variable');
    expect(face('Serif')).toContain('Georgia');
    expect(face('Sans')).toContain('system-ui');
  });

  it('pdf_disables_what_does_not_apply', async () => {
    const user = userEvent.setup();
    const p = panel({ format: 'pdf' });
    expect(screen.getByText('Per i PDF valgono tema e zoom')).toBeInTheDocument();
    for (const name of ['Lora', 'Ampi', 'Scorrimento', '1,8']) expect(screen.getByRole('radio', { name })).toBeDisabled();
    for (const name of ['Giustifica il testo', 'Sillabazione', "Stili dell'editore"])
      expect(screen.getByRole('switch', { name })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Più grande' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Scuro' })).toBeEnabled();
    expect(screen.getByRole('switch', { name: "Due pagine quando c'è spazio" })).toBeEnabled();
    await user.click(screen.getByRole('radio', { name: 'Adatta alla pagina' }));
    expect(last(p).pdfFit).toBe('page');
  });

  it('reset_returns_the_defaults', async () => {
    const user = userEvent.setup();
    const p = panel({}, { theme: 'black', fontSize: 25, justify: false, panelOpen: true });
    expect(screen.getByText('Vale per tutti i libri su questo computer')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ripristina' }));
    expect(last(p)).toEqual({ ...DEFAULT_SETTINGS, panelOpen: true });
  });

  it('says telefono on the phone', () => {
    panel({ layout: 'phone' });
    expect(screen.getByText('Vale per tutti i libri su questo telefono')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByRole('radio', { name: 'Chiaro' })).toBeInTheDocument();
  });

  it('appearance_on_desktop_is_anchored_and_not_modal', () => {
    const { container } = render(<div />);
    panel();
    expect(screen.getByRole('dialog', { name: 'Aspetto' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aa' }).closest('[aria-hidden]')).toBeNull();
    expect(document.body).not.toHaveAttribute('aria-hidden');
    expect(container).not.toHaveAttribute('aria-hidden');
  });

  it('theme_tiles_show_each_theme', () => {
    panel();
    const group = screen.getByRole('radiogroup', { name: 'Tema' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'false', 'false']);
    for (const [name, key] of [['Chiaro', 'light'], ['Seppia', 'sepia'], ['Scuro', 'dark'], ['Nero', 'black']] as const) {
      const tile = screen.getByRole('radio', { name });
      expect(tile).toHaveTextContent(name);
      const face = within(tile).getByText('Aa');
      expect(face.style.background).not.toBe('');
      expect(face.style.color).not.toBe('');
      expect(THEME_COLORS[key].page).toMatch(/^#/);
    }
    expect(within(screen.getByRole('radio', { name: 'Auto' })).getAllByText('Aa')).toHaveLength(2);
  });

  it('two_pages_row_is_not_on_the_phone', () => {
    panel({ layout: 'phone' });
    expect(screen.queryByRole('switch', { name: "Due pagine quando c'è spazio" })).not.toBeInTheDocument();
  });

  it('phone_appearance_sheet_fits_its_rows', async () => {
    const user = userEvent.setup();
    const p = panel({ layout: 'phone' });
    const dialog = screen.getByRole('dialog', { name: 'Aspetto' });
    expect(dialog).toHaveAttribute('data-reader-sheet-fit');
    const line = screen.getByRole('radiogroup', { name: 'Interlinea' });
    const margins = screen.getByRole('radiogroup', { name: 'Margini' });
    expect(line.parentElement!.parentElement).toBe(margins.parentElement!.parentElement);
    expect(within(margins).getAllByRole('radio').map((r) => r.textContent)).toEqual(['S', 'M', 'L']);
    await user.click(within(margins).getByRole('radio', { name: 'Ampi' }));
    expect(last(p).margins).toBe('wide');
    expect(screen.getByRole('switch', { name: "Stili dell'editore" })).toBeInTheDocument();
  });

  it('other_sheets_still_open_at_70_percent', () => {
    render(
      <ReaderLocale locale="it">
        <Sheet open onOpenChange={() => {}} title="Note">contenuto</Sheet>
      </ReaderLocale>,
    );
    expect(screen.getByRole('dialog', { name: 'Note' })).not.toHaveAttribute('data-reader-sheet-fit');
    // A literal `new URL('…', import.meta.url)` is rewritten by Vite into a served http URL; a variable is not.
    const sheetCss = '../view/Sheet.css';
    const css = readFileSync(fileURLToPath(new URL(sheetCss, import.meta.url)), 'utf8');
    expect(css).toMatch(/height:\s*var\(--reader-sheet-h,\s*70dvh\)/);
    expect(css).toMatch(/\[data-reader-sheet-fit\]\s*{[^}]*max-height:\s*var\(--reader-sheet-h,\s*92dvh\)/s);
  });
});
