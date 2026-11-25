import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@bookeeper/api';

const DAY = 24 * 60 * 60 * 1000;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        // Offline, a view keeps showing the last result it has; a failed refetch does not drop it.
        networkMode: 'offlineFirst',
        gcTime: DAY,
        // Only a server fault is worth repeating: a 401 is the transport's business, no network stays so.
        retry: (count, error) => error instanceof ApiError && error.status >= 500 && count < 2,
      },
    },
  });
}
