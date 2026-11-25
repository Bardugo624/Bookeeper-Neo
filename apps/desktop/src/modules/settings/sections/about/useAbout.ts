import { useQuery } from '@tanstack/react-query';
import { useClient, useSession } from '../../../../session';

/** Version of the running server (`/health`) and what it can do (`/server`). */
export function useAbout() {
  const client = useClient();
  const connectionId = useSession((s) => s.connection?.id);
  const health = useQuery({ queryKey: ['settings', connectionId, 'health'], retry: false, queryFn: () => client.health() });
  const server = useQuery({ queryKey: ['settings', connectionId, 'server'], retry: false, queryFn: () => client.getServerInfo() });
  return { health, server };
}
