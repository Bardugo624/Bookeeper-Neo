import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useClient, useSession } from '../../session';

/** Device list and its writes. Components never touch the client. */
export function useDevices(pollMs: number | false = false) {
  const client = useClient();
  const connectionId = useSession((s) => s.connection?.id);
  const qc = useQueryClient();
  const key = ['devices', connectionId] as const;

  const query = useQuery({
    queryKey: [...key, 'list'],
    retry: false,
    refetchInterval: pollMs,
    queryFn: async () => (await client.listDevices()).devices,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => client.renameDevice(id, name.trim()),
    onSuccess: refresh,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => client.revokeDevice(id),
    onSuccess: refresh,
  });

  return { query, rename, revoke };
}

/** Server facts the phone pairing depends on (`phone_ready`, public address). */
export function useServerInfo(enabled: boolean) {
  const client = useClient();
  const connectionId = useSession((s) => s.connection?.id);
  return useQuery({
    queryKey: ['devices', connectionId, 'server'],
    enabled,
    retry: false,
    queryFn: () => client.getServerInfo(),
  });
}
