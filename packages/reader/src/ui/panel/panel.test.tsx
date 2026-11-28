import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ReaderLocale } from '../../i18n';
import { CompanionPanel } from './CompanionPanel';
import { NotesList, type NotesListProps } from './NotesList';
import { SearchTab, type SearchTabProps } from './SearchTab';
import { formatPercent } from '../view/format';
import { TocList } from './TocList';
import { NOTES, TOC, hit } from './fixtures';
import type { SearchHit } from './types';

const it_ = (ui: React.ReactElement) => render(<ReaderLocale locale="it">{ui}</ReaderLocale>);

describe('TocList', () => {
  it('toc_marks_the_current_chapter', () => {
    it_(<TocList items={TOC} current="c2.xhtml" onGo={() => {}} />);
    expect(screen.getByRole('button', { name: /Capitolo II/ })).toHaveAttribute('aria-current', 'location');
    expect(screen.getByRole('button', { name: /Capitolo I\b(?!I)/ })).not.toHaveAttribute('aria-current');
    expect(screen.getByText('6,0%')).toBeInTheDocument();
    expect(screen.getByText('1,0%')).toBeInTheDocument();
    // nested chapters live in a nested list
    const nested = screen.getByRole('button', { name: /Prima parte/ }).closest('ul')!;
    expect(nested.parentElement?.tagName).toBe('LI');
  });

  it('toc_scrolls_the_current_chapter_into_view', () => {
    const spy = vi.fn();
    Element.prototype.scrollIntoView = spy;
    it_(<TocList items={TOC} current="c2.xhtml" onGo={() => {}} />);
    expect(spy).toHaveBeenCalled();
  });

  it('toc_click_goes_to_href', async () => {
    const onGo = vi.fn();
    it_(<TocList items={TOC} current={null} onGo={onGo} />);
    await userEvent.click(screen.getByRole('button', { name: /Prima parte/ }));
    expect(onGo).toHaveBeenCalledWith('c1.xhtml#a');
  });
});

function notes(props: Partial<NotesListProps> = {}) {
  const full: NotesListProps = {
    items: NOTES,
    theme: 'light',
    onGo: vi.fn(),
    onEditNote: vi.fn(),
    onRecolor: vi.fn(),
    onCopy: vi.fn(),
    onRemove: vi.fn(),
    onExport: vi.fn(),
    ...props,
  };
  it_(<NotesList {...full} />);
  return full;
}

describe('NotesList', () => {
  it('notes_filter_by_color_and_bookmarks', async () => {
    notes();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Tutte: 4' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Segnalibri: 1' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText(/Per un buon pezzo/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ambra: 2' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByText(/il Resegone/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Notte: 0' }));
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByText('Niente con questo filtro.')).toBeInTheDocument();
  });

  it('note_percents_have_one_decimal_under_ten', () => {
    notes({ items: [{ ...NOTES[0], chapter: 'Capitolo 1', percent: 0.4 }, { ...NOTES[1], chapter: 'Capitolo 2', percent: 42.4 }] });
    expect(screen.getByText('Capitolo 1 · 0,4%')).toBeInTheDocument();
    expect(screen.getByText('Capitolo 2 · 42%')).toBeInTheDocument();
  });

  it('shows_chapter_percent_text_and_note_and_goes_to_the_entry', async () => {
    const p = notes();
    expect(screen.getByText('Capitolo II · 6,0%')).toBeInTheDocument();
    expect(screen.getByText('Da rileggere.')).toBeInTheDocument();
    expect(screen.getByText('Segnalibro · Capitolo I · 3,0%')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /il Resegone/ }));
    expect(p.onGo).toHaveBeenCalledWith(NOTES[1]);
  });

  async function openMenu(text: RegExp) {
    const row = screen.getByText(text).closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Azioni per questa voce' }));
  }

  it('note_menu_offers_edit_color_copy_remove', async () => {
    const p = notes();
    await openMenu(/Quel ramo/);
    const names = screen.getAllByRole('menuitem').map((m) => m.textContent);
    expect(names).toEqual(['Modifica la nota', 'Cambia colore', 'Copia', 'Togli']);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Modifica la nota' }));
    expect(p.onEditNote).toHaveBeenCalledWith(NOTES[0]);
  });

  it('change_color_offers_the_four_colors', async () => {
    const p = notes();
    await openMenu(/Quel ramo/);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Cambia colore' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Salvia' }));
    expect(p.onRecolor).toHaveBeenCalledWith(NOTES[0], 'sage');
  });

  it('copy_calls_back', async () => {
    const p = notes();
    await openMenu(/Quel ramo/);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Copia' }));
    expect(p.onCopy).toHaveBeenCalledWith(NOTES[0]);
  });

  it('remove_calls_back_without_confirmation', async () => {
    const p = notes();
    await openMenu(/il Resegone/);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Togli' }));
    expect(p.onRemove).toHaveBeenCalledWith(NOTES[1]);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a_bookmark_menu_has_only_copy_and_remove', async () => {
    notes();
    await openMenu(/Per un buon pezzo/);
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Copia', 'Togli']);
  });

  it('export_calls_back', async () => {
    const p = notes();
    expect(screen.getByText('Visibili solo a te')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Esporta in Markdown' }));
    expect(p.onExport).toHaveBeenCalledTimes(1);
  });
});

function Search({ initial = '', onQueryChange, ...props }: Partial<SearchTabProps> & { initial?: string }) {
  const [q, setQ] = useState(initial);
  return (
    <SearchTab
      results={[]}
      progress={1}
      done
      onPick={vi.fn()}
      {...props}
      query={q}
      onQueryChange={(v) => {
        setQ(v);
        onQueryChange?.(v);
      }}
    />
  );
}

describe('SearchTab', () => {
  const RESULTS = [hit(1, 'Capitolo I'), hit(2, 'Capitolo I'), hit(21, 'Capitolo VIII')];

  it('search_waits_for_two_characters', async () => {
    it_(<Search results={RESULTS} initial="m" />);
    expect(screen.getByText('Scrivi almeno 2 caratteri.')).toBeInTheDocument();
    expect(screen.queryByRole('option')).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    await userEvent.type(screen.getByRole('combobox'), 'o');
    expect(screen.queryByText('Scrivi almeno 2 caratteri.')).toBeNull();
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('search_groups_results_by_chapter', () => {
    it_(<Search results={RESULTS} initial="monti" />);
    const groups = screen.getAllByRole('group');
    expect(groups.map((g) => within(g).getByRole('heading').textContent)).toEqual(['Capitolo I', 'Capitolo VIII']);
    expect(within(groups[0]!).getAllByRole('option')).toHaveLength(2);
    const mark = within(groups[1]!).getByText('monti');
    expect(mark.tagName).toBe('MARK');
    expect(screen.getByText('21%')).toBeInTheDocument();
  });

  it('search_shows_progress_until_done', () => {
    const { rerender } = render(
      <ReaderLocale locale="it">
        <SearchTab query="monti" onQueryChange={() => {}} results={RESULTS} progress={0.6} done={false} onPick={() => {}} />
      </ReaderLocale>,
    );
    expect(screen.getByText('Cerco nel resto del libro…')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60');
    rerender(
      <ReaderLocale locale="it">
        <SearchTab query="monti" onQueryChange={() => {}} results={RESULTS} progress={1} done onPick={() => {}} />
      </ReaderLocale>,
    );
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByText('Cerco nel resto del libro…')).toBeNull();
  });

  it('result_count_is_announced', () => {
    const { rerender } = render(
      <ReaderLocale locale="it">
        <SearchTab query="monti" onQueryChange={() => {}} results={RESULTS} progress={0.5} done={false} onPick={() => {}} />
      </ReaderLocale>,
    );
    const live = screen.getByText('3 risultati finora');
    expect(live).toHaveAttribute('aria-live', 'polite');
    rerender(
      <ReaderLocale locale="it">
        <SearchTab query="monti" onQueryChange={() => {}} results={RESULTS.slice(0, 1)} progress={1} done onPick={() => {}} />
      </ReaderLocale>,
    );
    expect(screen.getByText('1 risultato')).toHaveAttribute('aria-live', 'polite');
  });

  it('search_count_is_announced_at_the_end_not_per_result', () => {
    vi.useFakeTimers();
    try {
      const view = (results: SearchHit[], done: boolean) => (
        <ReaderLocale locale="it">
          <SearchTab query="monti" onQueryChange={() => {}} results={results} progress={0.5} done={done} onPick={() => {}} />
        </ReaderLocale>
      );
      const { rerender, container } = render(view(RESULTS.slice(0, 1), false));
      const live = () => container.querySelector('[aria-live]')!.textContent;
      expect(live()).toBe('1 risultato finora');
      rerender(view(RESULTS.slice(0, 2), false));
      expect(live()).toBe('1 risultato finora');
      act(() => void vi.advanceTimersByTime(1000));
      rerender(view(RESULTS, false));
      expect(live()).toBe('1 risultato finora');
      act(() => void vi.advanceTimersByTime(1000));
      expect(live()).toBe('3 risultati finora');
      rerender(view(RESULTS, true));
      expect(live()).toBe('3 risultati');
    } finally {
      vi.useRealTimers();
    }
  });

  it('says_when_nothing_was_found', () => {
    it_(<Search results={[]} initial="zzz" />);
    expect(screen.getByText('Nessun risultato.')).toBeInTheDocument();
  });

  it('clear_empties_the_field', async () => {
    const onQueryChange = vi.fn();
    it_(<Search onQueryChange={onQueryChange} initial="monti" />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancella' }));
    expect(onQueryChange).toHaveBeenLastCalledWith('');
    expect(screen.getByRole('combobox')).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Cancella' })).toBeNull();
  });

  it('arrow_keys_and_enter_choose_a_result', async () => {
    const onPick = vi.fn();
    it_(<Search results={RESULTS} initial="monti" onPick={onPick} />);
    const box = screen.getByRole('combobox');
    box.focus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(box).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[2]!.id);
    expect(screen.getAllByRole('option')[2]).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowUp}{Enter}');
    expect(onPick).toHaveBeenCalledWith(RESULTS[1]);
  });

  it('click_chooses_a_result', async () => {
    const onPick = vi.fn();
    it_(<Search results={RESULTS} initial="monti" onPick={onPick} />);
    await userEvent.click(screen.getAllByRole('option')[2]!);
    expect(onPick).toHaveBeenCalledWith(RESULTS[2]);
  });
});

describe('CompanionPanel', () => {
  function panel(variant: 'aside' | 'sheet', tab: 'toc' | 'notes' | 'search' = 'toc', onTab = vi.fn()) {
    it_(
      <CompanionPanel
        variant={variant}
        open
        onClose={() => {}}
        tab={tab}
        onTab={onTab}
        toc={{ items: TOC, current: null, onGo: () => {} }}
        notes={{
          items: NOTES, theme: 'light', onGo: () => {}, onEditNote: () => {}, onRecolor: () => {},
          onCopy: () => {}, onRemove: () => {}, onExport: () => {},
        }}
        search={{ query: '', onQueryChange: () => {}, results: [], progress: 1, done: true, onPick: () => {} }}
      />,
    );
    return onTab;
  }

  it('the_desktop_variant_is_an_aside_with_three_tabs', async () => {
    const onTab = panel('aside');
    expect(screen.getByRole('complementary')).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Indice', 'Note', 'Cerca']);
    expect(screen.getByRole('tab', { name: 'Indice' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('tab', { name: 'Note' }));
    expect(onTab).toHaveBeenCalledWith('notes');
  });

  it('the_phone_variant_is_a_sheet_with_the_same_tabs', () => {
    panel('sheet', 'notes');
    expect(screen.queryByRole('complementary')).toBeNull();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Indice', 'Note', 'Cerca']);
    expect(within(dialog).getByRole('button', { name: 'Esporta in Markdown' })).toBeInTheDocument();
  });

  it('renders_nothing_when_closed', () => {
    it_(
      <CompanionPanel
        variant="aside" open={false} onClose={() => {}} tab="toc" onTab={() => {}}
        toc={{ items: [], current: null, onGo: () => {} }}
        notes={{ items: [], theme: 'light', onGo: () => {}, onEditNote: () => {}, onRecolor: () => {}, onCopy: () => {}, onRemove: () => {}, onExport: () => {} }}
        search={{ query: '', onQueryChange: () => {}, results: [], progress: 1, done: true, onPick: () => {} }}
      />,
    );
    expect(screen.queryByRole('complementary')).toBeNull();
  });
});

it('small_percents_have_one_decimal', () => {
  expect(formatPercent(0.004)).toBe('0,4%');
  expect(formatPercent(0.004, 'en')).toBe('0.4%');
  expect(formatPercent(0.0951)).toBe('9,5%');
  expect(formatPercent(0.1)).toBe('10%');
  expect(formatPercent(0.426)).toBe('43%');
  expect(formatPercent(0)).toBe('0,0%');
});
