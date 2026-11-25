import type { ReadingList } from '@bookeeper/api';
import { useQuery } from '@tanstack/react-query';
import { useClient, useSession } from '../../session';

/** Prefix of the reading statistics: the reading views invalidate `['reading-stats']`. */
export const READING_STATS_KEY = ['reading-stats'] as const;

const PAGE = 200;
const MAX_PAGES = 50;

/** `year` undefined asks for the server's current year. */
export function useReadingStats(year?: number) {
  const client = useClient();
  const connectionId = useSession((s) => s.connection?.id);
  return useQuery({
    queryKey: [...READING_STATS_KEY, connectionId, year ?? 'current'],
    retry: false,
    queryFn: () => client.getReadingStats(year),
  });
}

/** Books finished in `year`, most recent first: the covers of the poster. Only while `enabled`. */
export function useFinishedBooks(year: number, enabled: boolean) {
  const client = useClient();
  const connectionId = useSession((s) => s.connection?.id);
  return useQuery({
    queryKey: [...READING_STATS_KEY, connectionId, 'finished', year],
    enabled,
    retry: false,
    queryFn: async () => {
      // The endpoint sorts by `updated_at` and has no year filter: page through every read book.
      const items: ReadingList['items'] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const chunk = await client.listReading({ status: 'read', limit: PAGE, offset: page * PAGE });
        items.push(...chunk.items);
        if (chunk.items.length < PAGE) break;
      }
      return items
        .filter((i) => i.finished_at != null && new Date(i.finished_at * 1000).getUTCFullYear() === year)
        .sort((a, b) => (b.finished_at ?? 0) - (a.finished_at ?? 0))
        .map((i) => ({ id: i.book.id, title: i.book.title, color: i.book.cover_color ?? null }));
    },
  });
}
