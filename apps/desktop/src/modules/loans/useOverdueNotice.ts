import { useEffect, useRef } from 'react';
import { useLocale, useT } from '../../app';
import { toDateInputValue, usePermission } from '../../kit';
import { useOverdueAlerts } from '../../kit/overdueAlerts';
import { usePlatform } from '../../platform';
import { useClient, useSession } from '../../session';
import { borrowerLabel } from './loanStatus';

export const NOTICE_CHECK_MS = 60 * 60 * 1000;
export const NOTICE_KEY_PREFIX = 'bookeeper.overdueNotified.';
const SHOWN = 3;
const DAY_SECONDS = 86_400;

function lastSent(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function remember(key: string, day: string): void {
  try {
    localStorage.setItem(key, day);
  } catch {
    // Unavailable storage: the notice may repeat, which is better than losing it.
  }
}

/** Checks at start-up and then every hour; sends at most one notification a day for the library. */
export function useOverdueNotice(): void {
  const t = useT();
  const locale = useLocale();
  const client = useClient();
  const { notifications } = usePlatform();
  const [enabled] = useOverdueAlerts();
  const { can } = usePermission();
  const libraryId = useSession((s) => s.me?.library.id);
  const canWrite = can('write');
  const busy = useRef(false);
  const latest = useRef({ t, client, notifications, enabled, canWrite, libraryId, locale });
  latest.current = { t, client, notifications, enabled, canWrite, libraryId, locale };

  useEffect(() => {
    const check = async () => {
      const { t, client, notifications, enabled, canWrite, libraryId } = latest.current;
      if (busy.current || !notifications || !enabled || !canWrite || !libraryId) return;
      busy.current = true;
      try {
        const now = Math.floor(Date.now() / 1000);
        const today = toDateInputValue(now);
        const key = NOTICE_KEY_PREFIX + libraryId;
        if (lastSent(key) === today) return;
        if ((await notifications.permission()) !== 'granted') return;
        const { items, total } = await client.listLoans({ status: 'overdue', limit: SHOWN });
        if (total === 0 || items.length === 0) return;
        const lines = items.map((l) =>
          t('loans.notify.line', {
            title: l.book_title,
            name: borrowerLabel(l),
            since: t('loans.notify.since', { count: Math.max(1, Math.floor((now - (l.due_at ?? now)) / DAY_SECONDS)) }),
          }),
        );
        if (total > items.length) lines.push(t('loans.notify.more', { count: total - items.length }));
        await notifications.send({ title: t('loans.notify.title'), body: lines.join('\n') });
        remember(key, today);
      } catch {
        // A failed check is retried at the next hour.
      } finally {
        busy.current = false;
      }
    };
    void check();
    const id = setInterval(() => void check(), NOTICE_CHECK_MS);
    return () => clearInterval(id);
  }, []);
}
