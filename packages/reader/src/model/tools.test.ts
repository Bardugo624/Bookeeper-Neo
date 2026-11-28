import { describe, expect, it } from 'vitest';
import {
  EXPORT_LABELS, INITIAL_SPEED, afterTurn, chapterTicks, exportMarkdown, isExpired, jumpFrom, markdownFileName, minutesLeft, recordTurn,
  type ExportItem,
} from './index';

describe('speed', () => {
  it('short_and_long_pages_do_not_count', () => {
    expect(recordTurn(INITIAL_SPEED, 1000, 1999)).toBe(INITIAL_SPEED);
    expect(recordTurn(INITIAL_SPEED, 1000, 180001)).toBe(INITIAL_SPEED);
    expect(recordTurn(INITIAL_SPEED, 1000, 60000).charsPerMinute).toBe(1000);
  });
  it('times_appear_after_three_measured_minutes', () => {
    let s = INITIAL_SPEED;
    for (let i = 0; i < 2; i++) s = recordTurn(s, 1000, 60000);
    expect(minutesLeft(s, 5000)).toBeNull();
    s = recordTurn(s, 1000, 60000);
    expect(minutesLeft(s, 5000)).toBe(5);
  });
  it('moving_average_weighs_new_pages_0_2', () => {
    const s = recordTurn({ charsPerMinute: 1000, measuredMs: 60000 }, 2000, 60000);
    expect(s.charsPerMinute).toBeCloseTo(1200);
    expect(s.measuredMs).toBe(120000);
  });
});

describe('jumps', () => {
  it('jump_back_expires_after_two_forward_turns', () => {
    let j = jumpFrom({ cfi: 'x' }, 4);
    j = afterTurn(j, 'next');
    expect(isExpired(j)).toBe(false);
    j = afterTurn(j, 'next');
    expect(isExpired(j)).toBe(true);
  });
  it('a_backward_turn_does_not_count', () => {
    let j = jumpFrom({ cfi: 'x' }, 4);
    j = afterTurn(afterTurn(afterTurn(j, 'prev'), 'next'), 'prev');
    expect(j.forwardTurns).toBe(1);
    expect(isExpired(j)).toBe(false);
  });
});

describe('ticks', () => {
  it('ticks_are_the_top_level_chapters_sorted_and_unique', () => {
    const item = (fraction: number | null, children = []) => ({ label: 'c', href: 'h', fraction, children });
    const toc = [item(0.5, [item(0.6) as never]), item(0), item(0.2), item(0.5), item(null)];
    expect(chapterTicks(toc, [0, 0.3, 1])).toEqual([0.2, 0.5]);
  });

  it('at_most_forty_ticks_and_the_first_stays', () => {
    const toc = Array.from({ length: 200 }, (_, i) => ({ label: 'c', href: `h${i}`, fraction: (i + 1) / 201, children: [] }));
    const ticks = chapterTicks(toc, [0, 1]);
    expect(ticks.length).toBeLessThanOrEqual(40);
    expect(ticks.length).toBeGreaterThan(30);
    expect(ticks[0]).toBe(1 / 201);
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]! - ticks[i - 1]!).toBeGreaterThanOrEqual(1 / 40 - 1e-9);
  });

  it('keeps_close_ticks_when_there_are_forty_or_fewer', () => {
    const toc = [0.1, 0.11, 0.5].map((fraction, i) => ({ label: 'c', href: `h${i}`, fraction, children: [] }));
    expect(chapterTicks(toc, [0, 1])).toEqual([0.1, 0.11, 0.5]);
  });
});

const meta = { title: 'I promessi sposi', author: 'Alessandro Manzoni' };
const items: ExportItem[] = [
  { kind: 'highlight', chapter: 'Capitolo I', text: 'Quel ramo del lago di Como, che volge a mezzogiorno, tra due catene non interrotte di monti', note: "L'incipit che si studia a scuola: rileggerlo ad alta voce.", percent: 1, color: 'amber' },
  { kind: 'bookmark', chapter: 'Capitolo I', text: 'Per un buon pezzo, la costa sale con un pendìo lento e continuo…', note: null, percent: 3, color: null },
];

describe('markdown', () => {
  it('export_matches_the_contract_example', () => {
    expect(exportMarkdown(meta, items, EXPORT_LABELS.it)).toBe(`# I promessi sposi

Alessandro Manzoni

## Capitolo I

> Quel ramo del lago di Como, che volge a mezzogiorno, tra due catene non interrotte di monti

L'incipit che si studia a scuola: rileggerlo ad alta voce.

*1% · Ambra*

## Segnalibri

- Capitolo I · 3% — «Per un buon pezzo, la costa sale con un pendìo lento e continuo…»
`);
  });
  it('english_labels', () => {
    const out = exportMarkdown(meta, items, EXPORT_LABELS.en);
    expect(out).toContain('*1% · Amber*');
    expect(out).toContain('## Bookmarks');
  });
  it('file_name_drops_forbidden_characters', () => {
    expect(markdownFileName(meta)).toBe('Alessandro Manzoni - I promessi sposi - note.md');
    expect(markdownFileName({ title: 'A/B: "C"?', author: 'x|y' })).toBe('xy - AB C - note.md');
    expect(markdownFileName({ title: 'T', author: null })).toBe('T - note.md');
  });
  it('multi_paragraph_notes_stay_intact', () => {
    const note = 'Primo paragrafo.\n\nSecondo paragrafo.\n- elenco';
    const out = exportMarkdown(meta, [{ ...items[0]!, note }], EXPORT_LABELS.it);
    expect(out).toContain(`\n\n${note}\n\n`);
  });
});
