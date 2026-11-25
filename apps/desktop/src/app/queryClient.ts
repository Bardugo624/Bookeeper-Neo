import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@bookeeper/api';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        // An expired session is handled by the transport; repeating a 401 only adds noise.
        retry: (count, error) => !(error instanceof ApiError && error.status === 401) && count < 2,
      },
    },
  });
}
