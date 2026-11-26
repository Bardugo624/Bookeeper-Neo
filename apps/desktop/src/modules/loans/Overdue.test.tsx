import { act, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOverdueCount } from './index';
import { useOverdueAlerts } from '../../kit/overdueAlerts';
import { NOTICE_CHECK_MS, NOTICE_KEY_PREFIX } from './useOverdueNotice';
import { DAY, loan, renderLoans, type Store } from './testkit';

const NOW = new Date(2026, 5, 10, 9, 0, 0);
const now = () => Math.floor(NOW.getTime() / 1000);
const late = (i: number, days: number, over = {}) => loan(i, { overdue: true, due_at: now() - days * DAY, ...over });
const store = (over: Partial<Store> = {}): Store => ({ loans: [late(1, 3, { book_title: 'Dune', borrower_name: 'Marco' })], books: [], ...over });
const granted = { permission: 'granted' as const };
const KEY = NOTICE_KEY_PREFIX + 'l1';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const overdueCalls = (p: { calls: Array<{ method: string; path: string }> }) =>
  p.calls.filter((c) => c.path.startsWith('/api/v1/loans?') && c.path.includes('status=overdue'));

describe('badge', () => {
  it('shows the number with an accessible name, in the sidebar', async () => {
    renderLoans(store({ loans: [late(1, 1), late(2, 2), late(3, 3), loan(4)] }), '/loans', [], granted);
    const badge = await screen.findByRole('img', { name: '3 prestiti scaduti' });
    expect(badge).toHaveTextContent('3');
    expect(within(screen.getByRole('link', { name: /Prestiti/ })).getByText('3')).toBeInTheDocument();
  });

  it('uses the singular form', async () => {
    renderLoans(store());
    expect(await screen.findByRole('img', { name: '1 prestito scaduto' })).toBeInTheDocument();
  });

  it('is absent with no overdue loans', async () => {
    const { platform } = renderLoans(store({ loans: [loan(1)] }));
    await waitFor(() => expect(overdueCalls(platform).length).toBeGreaterThan(0));
    expect(screen.queryByRole('img', { name: /scadut/ })).not.toBeInTheDocument();
  });

  it('asks for one row and uses the total', async () => {
    const { platform } = renderLoans(store({ loans: [late(1, 1), late(2, 1)] }));
    await screen.findByRole('img', { name: '2 prestiti scaduti' });
    const q = new URL(overdueCalls(platform)[0]!.path, 'http://x').searchParams;
    expect(q.get('limit')).toBe('1');
  });

  it('is shown to a guest too', async () => {
    renderLoans(store({ role: 'guest' }));
    expect(await screen.findByRole('img', { name: '1 prestito scaduto' })).toBeInTheDocument();
  });
});

describe('useOverdueCount', () => {
  it('is exported and refreshes after a write', async () => {
    const user = userEvent.setup();
    const s = store({ loans: [late(1, 2, { id: 'l1' })] });
    renderLoans(s);
    await screen.findByRole('img', { name: '1 prestito scaduto' });
    await screen.findByText('Libro 1');
    await user.click(screen.getByRole('button', { name: /Segna come restituito|Restituisci/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getAllByRole('button').find((b) => /Segna|Restitu|Conferma/.test(b.textContent ?? ''))!);
    await waitFor(() => expect(screen.queryByRole('img', { name: /scadut/ })).not.toBeInTheDocument());
    expect(typeof useOverdueCount).toBe('function');
  });
});

describe('notification', () => {
  it('sends once a day, with the day remembered per library', async () => {
    const s = store();
    const first = renderLoans(s, '/loans', [], granted);
    await waitFor(() => expect(first.platform.notificationsFake.sent).toHaveLength(1));
    expect(first.platform.notificationsFake.sent[0]).toEqual({ title: 'Prestiti scaduti', body: '«Dune» · Marco · da 3 giorni' });
    expect(localStorage.getItem(KEY)).toBe('2026-06-10');
    first.unmount();

    const second = renderLoans(s, '/loans', [], granted);
    await screen.findByRole('img', { name: '1 prestito scaduto' });
    await act(async () => {});
    expect(second.platform.notificationsFake.sent).toHaveLength(0);
    second.unmount();

    vi.setSystemTime(new Date(2026, 5, 11, 9, 0, 0));
    const third = renderLoans(s, '/loans', [], granted);
    await waitFor(() => expect(third.platform.notificationsFake.sent).toHaveLength(1));
  });

  it('checks again every hour', async () => {
    const spy = vi.spyOn(globalThis, 'setInterval');
    const s = store({ loans: [] });
    const { platform } = renderLoans(s, '/loans', [], granted);
    await waitFor(() => expect(overdueCalls(platform).length).toBeGreaterThan(0));
    await act(async () => {});
    expect(platform.notificationsFake.sent).toHaveLength(0);
    s.loans = [late(1, 1, { book_title: 'Dune', borrower_name: 'Marco' })];
    const tick = spy.mock.calls.find((c) => c[1] === NOTICE_CHECK_MS)![0] as () => void;
    await act(async () => tick());
    await waitFor(() => expect(platform.notificationsFake.sent).toHaveLength(1));
    expect(platform.notificationsFake.sent[0]!.body).toBe('«Dune» · Marco · da 1 giorno');
  });

  it('lists three loans and the rest', async () => {
    const loans = [1, 2, 3, 4, 5].map((i) => late(i, i, { book_title: `T${i}`, borrower_name: `P${i}` }));
    const { platform } = renderLoans(store({ loans }), '/loans', [], granted);
    await waitFor(() => expect(platform.notificationsFake.sent).toHaveLength(1));
    expect(platform.notificationsFake.sent[0]!.body).toBe(
      '«T1» · P1 · da 1 giorno\n«T2» · P2 · da 2 giorni\n«T3» · P3 · da 3 giorni\ne altri 2',
    );
  });

  async function silent(opts: Parameters<typeof renderLoans>[3], s = store(), role?: Store['role']) {
    const r = renderLoans({ ...s, role }, '/loans', [], opts);
    await screen.findByText('Dune').catch(() => {});
    await act(async () => {});
    await act(async () => {});
    return r;
  }

  it('does not send without permission', async () => {
    const { platform } = await silent({ permission: 'prompt' });
    expect(platform.notificationsFake.sent).toHaveLength(0);
    expect(platform.notificationsFake.requests).toBe(0);
  });

  it('does not send with the alert off', async () => {
    const alerts = renderHook(() => useOverdueAlerts());
    act(() => alerts.result.current[1](false));
    try {
      const { platform } = await silent(granted);
      expect(platform.notificationsFake.sent).toHaveLength(0);
    } finally {
      act(() => alerts.result.current[1](true));
    }
  });

  it('does not send to a guest', async () => {
    const { platform } = await silent(granted, store(), 'guest');
    expect(platform.notificationsFake.sent).toHaveLength(0);
  });

  it('does not send with no overdue loans', async () => {
    const { platform } = await silent(granted, store({ loans: [loan(1)] }));
    expect(platform.notificationsFake.sent).toHaveLength(0);
  });

  it('does nothing where notifications are null', async () => {
    const { platform } = await silent(undefined);
    expect(platform.notificationsFake.sent).toHaveLength(0);
    await screen.findByRole('img', { name: '1 prestito scaduto' });
  });

  it('still sends when the local storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('no storage');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('no storage');
    });
    const { platform } = renderLoans(store(), '/loans', [], granted);
    await waitFor(() => expect(platform.notificationsFake.sent).toHaveLength(1));
  });
});
