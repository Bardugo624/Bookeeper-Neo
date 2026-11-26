import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetLocalePreferenceForTest } from '../../../../app/i18n';
import { t } from '@bookeeper/i18n';
import type { AuditOut } from '@bookeeper/api';
import { collectSections } from '../../sections';
import { KNOWN_ACTIONS } from './auditModel';
import { auditCsv } from './auditCsv';
import { auditCalls, entry, renderAudit } from './testkit';

beforeEach(() => {
  localStorage.clear();
  resetLocalePreferenceForTest();
});

describe('visibility', () => {
  it.each([
    ['owner', true],
    ['admin', true],
    ['member', false],
    ['guest', false],
  ] as const)('%s sees the section: %s', (role, shown) => {
    const ids = collectSections({ role, platform: 'tauri' }).map((s) => s.id);
    expect(ids.includes('audit')).toBe(shown);
    if (shown) expect(collectSections({ role, platform: 'tauri' }).find((s) => s.id === 'audit')?.order).toBe(70);
  });
});

describe('sentences', () => {
  it('has a sentence in both languages for every action the core writes', () => {
    expect(KNOWN_ACTIONS.length).toBeGreaterThanOrEqual(10);
    for (const a of KNOWN_ACTIONS) {
      for (const l of ['it', 'en'] as const) {
        expect(t(l, `audit.what.${a}`)).not.toBe(`audit.what.${a}`);
        expect(t(l, `audit.actions.${a}`)).not.toBe(`audit.actions.${a}`);
      }
    }
  });

  it('writes readable text for known actions, links an existing book and falls back to the raw name', async () => {
    const entries = [
      entry(1, { action: 'book.create', entity_id: 'b1', detail: { title: 'Dune' } }),
      entry(2, { action: 'loan.return', entity_type: 'loan', entity_id: 'l1', detail: null }),
      entry(3, { action: 'shelf.create', entity_type: 'shelf', detail: null }),
      entry(4, { action: 'tag.create', entity_type: 'tag', detail: { name: 'Giallo' } }),
      entry(5, { action: 'reading.set', entity_type: 'reading', entity_id: 'b9', detail: { status: 'read' } }),
      entry(6, { action: 'library.import', entity_type: 'library', detail: { new: 3, duplicates: 1, invalid: 0, format: 'csv' } }),
      entry(7, { action: 'wishlist.create', entity_type: 'wishlist', detail: { title: 'Ubik' } }),
      entry(8, { action: 'book.delete', entity_id: 'b1', detail: null }),
      entry(9, { action: 'room.delete', entity_type: 'room', detail: null }),
      entry(10, { action: 'device.revoke', entity_type: 'device', detail: null }),
      entry(11, { action: 'mystery.thing', entity_type: 'mystery', detail: null, user: null, device: null }),
    ];
    renderAudit({ entries, books: { b1: 'Dune', b9: 'Iperione' } });
    expect(await screen.findByText('Ha creato uno scaffale')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Dune' })).toHaveAttribute('href', '/books/b1');
    expect(screen.getByText('Ha registrato la restituzione di un libro')).toBeInTheDocument();
    expect(screen.getByText('Ha creato il tag «Giallo»')).toBeInTheDocument();
    expect(screen.getByText('Ha importato dei libri (3 nuovi, 1 già presenti)')).toBeInTheDocument();
    expect(screen.getByText('Ha aggiunto «Ubik» alla lista dei desideri')).toBeInTheDocument();
    expect(screen.getByText('Ha eliminato un libro')).toBeInTheDocument();
    expect(screen.getByText('Ha eliminato una stanza')).toBeInTheDocument();
    expect(screen.getByText('Ha revocato un dispositivo')).toBeInTheDocument();
    const link = await screen.findByRole('link', { name: 'Iperione' });
    expect(link.className).toMatch(/link/);
    expect(link.parentElement?.textContent).toBe('Ha impostato lo stato di lettura di «Iperione»: letto');
    expect(screen.getAllByText('mystery.thing').length).toBeGreaterThan(0);
    expect(screen.getByText('Sistema')).toBeInTheDocument();
  });
});

describe('detail', () => {
  it('shows the detail as text, never as HTML', async () => {
    const evil = '<script>alert(1)</script>';
    const { container } = renderAudit({ entries: [entry(1, { action: 'book.update', detail: { note: evil } })] });
    await userEvent.click(await screen.findByText('Dettaglio'));
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('pre')?.textContent).toContain(evil);
  });
});

describe('filters and pages', () => {
  it('sends the filters to the route, keeps them in the address and clears them', async () => {
    const { platform, router } = renderAudit({ entries: [entry(1)] }, '?action=loan.return&from=2024-01-02&to=2024-01-05');
    await screen.findByRole('table', { name: 'Voci del registro' });
    const first = auditCalls(platform).find((c) => c.path.includes('offset=0'))!;
    const q = new URLSearchParams(first.path.split('?')[1]);
    expect(q.get('action')).toBe('loan.return');
    expect(Number(q.get('from'))).toBeLessThan(Number(q.get('to')));
    expect(q.get('limit')).toBe('50');

    await waitFor(() => expect(screen.getByRole('option', { name: 'Anna' })).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText('Persona'), 'u1');
    await waitFor(() => expect(router.state.location.search).toContain('user=u1'));
    await waitFor(() => expect(auditCalls(platform).some((c) => c.path.includes('user_id=u1'))).toBe(true));

    await userEvent.click(screen.getByRole('button', { name: 'Azzera filtri' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(screen.getByLabelText('Azione')).toHaveValue('');
  });

  it('offers the actions of the log with readable labels', async () => {
    renderAudit({ entries: [entry(1)] });
    await screen.findByRole('table', { name: 'Voci del registro' });
    expect(await screen.findByRole('option', { name: 'Restituzione' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'mystery.thing' })).toBeInTheDocument();
  });

  it('loads more in pages of 50', async () => {
    const entries = Array.from({ length: 70 }, (_, i) => entry(i + 1));
    const { platform } = renderAudit({ entries });
    await screen.findByRole('table', { name: 'Voci del registro' });
    expect(screen.getAllByRole('row')).toHaveLength(51);
    await userEvent.click(screen.getByRole('button', { name: 'Carica altri' }));
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(71));
    expect(auditCalls(platform).some((c) => c.path.includes('offset=50'))).toBe(true);
    expect(screen.queryByRole('button', { name: 'Carica altri' })).toBeNull();
  });
});

describe('p3 fixes', () => {
  afterEach(() => vi.useRealTimers());

  it('pluralises the total', async () => {
    renderAudit({ entries: [entry(1)] });
    expect(await screen.findByText('1 voce')).toBeInTheDocument();
  });

  it('gives a missing book its own sentence, without quotes', async () => {
    renderAudit({ entries: [{ ...entry(1, { action: 'book.update', entity_id: 'zz', detail: null }) }] });
    expect(await screen.findByText('Ha modificato un libro non più presente')).toBeInTheDocument();
    expect(screen.queryByText(/«/)).toBeNull();
  });

  it('uses the local date in the CSV name', async () => {
    // 00:30 local: east of UTC the UTC date is still the day before (the check bites under TZ=Pacific/Auckland).
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2024, 2, 5, 0, 30));
    const { platform } = renderAudit({ entries: [entry(1)] });
    await screen.findByRole('table', { name: 'Voci del registro' });
    await userEvent.click(screen.getByRole('button', { name: 'Scarica CSV' }));
    await waitFor(() => expect(platform.saved).toHaveLength(1));
    expect(platform.saved[0]!.suggestedName).toBe('registro-attivita-2024-03-05.csv');
  });
});

describe('states', () => {
  it('shows the empty state and the forbidden message', async () => {
    const empty = renderAudit({ entries: [] });
    expect(await screen.findByText('Nessuna voce')).toBeInTheDocument();
    empty.unmount();
    renderAudit({ status: 403 });
    expect(await screen.findByText('Solo il proprietario e gli amministratori possono vedere il registro.')).toBeInTheDocument();
  });
});

describe('csv', () => {
  it('quotes, escapes and neutralises cells', () => {
    const e = entry(1, { detail: { a: 'x,"y"' } }) as AuditOut;
    const csv = auditCsv(['Numero', 'Persona'], [{ entry: e, at: '2024-01-01T00:00:00.000Z', person: 'Anna\nRossi', device: '=cmd', what: 'Ha detto "ciao"' }]);
    expect(csv.startsWith('﻿Numero,Persona\r\n')).toBe(true);
    expect(csv).toContain('"Anna\nRossi"');
    expect(csv).toContain("'=cmd");
    expect(csv).toContain('"Ha detto ""ciao"""');
    expect(csv).toContain('"{""a"":""x,\\""y\\""""}"');
  });

  it('downloads every page of the current results through saveFile', async () => {
    const entries = Array.from({ length: 230 }, (_, i) => entry(i + 1, { user: i === 0 ? null : undefined }));
    const { platform } = renderAudit({ entries });
    await screen.findByRole('table', { name: 'Voci del registro' });
    await userEvent.click(screen.getByRole('button', { name: 'Scarica CSV' }));
    await waitFor(() => expect(platform.saved).toHaveLength(1));
    const saved = platform.saved[0]!;
    expect(saved.mime).toBe('text/csv');
    expect(saved.suggestedName).toMatch(/^registro-attivita-\d{4}-\d{2}-\d{2}\.csv$/);
    const text = new TextDecoder().decode(saved.bytes);
    expect(text).toContain('Numero,Data e ora,Persona,Dispositivo,Azione,Descrizione');
    expect(text.trim().split('\r\n')).toHaveLength(231);
    expect(text).toContain('Sistema');
  });

  it('warns when the results exceed the limit', async () => {
    renderAudit({ entries: [entry(1)], total: 6000 });
    expect(await screen.findByText('Il file conterrà solo le prime 5000 voci su 6000.')).toBeInTheDocument();
  });
});
