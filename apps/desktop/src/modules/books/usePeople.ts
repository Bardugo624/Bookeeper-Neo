import { useQuery } from '@tanstack/react-query';
import { useClient, useSession } from '../../session';

/** The people of the library, as `GET /users` gives them. */
export function usePeople() {
  const client = useClient();
  const connectionId = useSession((s) => s.connection?.id);
  const { data } = useQuery({
    queryKey: ['people', connectionId, 'list'],
    retry: false,
    staleTime: 30_000,
    queryFn: () => client.listUsers(),
  });
  return data?.items ?? [];
}
