import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InviteRole, PatchPerson } from '@bookeeper/api';
import { useClient, useSession } from '../../session';
import { TOUCHED_KEYS } from './model';

/** The people of the library and their writes. Components never touch the client. */
export function usePeople() {
  const client = useClient();
  const connectionId = useSession((s) => s.connection?.id);
  const signOut = useSession((s) => s.signOut);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['people', connectionId, 'list'],
    retry: false,
    queryFn: async () => (await client.listUsers()).items,
  });
  const refresh = () => Promise.all(TOUCHED_KEYS.map((k) => qc.invalidateQueries({ queryKey: [k] })));

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: PatchPerson }) => client.updateUser(id, patch),
    onSuccess: refresh,
  });
  const remove = useMutation({ mutationFn: (id: string) => client.removeUser(id), onSuccess: refresh });
  const transfer = useMutation({
    mutationFn: async (id: string) => {
      await client.transferOwnership(id);
      // The caller's own role has changed: read `me` again, as the session does at start.
      useSession.setState({ me: await client.me() });
    },
    onSuccess: refresh,
  });
  /** Leaving ends the session: the server drops the devices, the app goes back to the start. */
  const leave = useMutation({
    mutationFn: async (id: string) => {
      await client.removeUser(id);
      await signOut();
    },
  });

  return { query, update, remove, transfer, leave };
}

/** Pending invitations (admin and owner only) and their writes. */
export function useInvites(enabled: boolean) {
  const client = useClient();
  const connectionId = useSession((s) => s.connection?.id);
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['invites'] });

  const query = useQuery({
    queryKey: ['invites', connectionId, 'list'],
    enabled,
    retry: false,
    queryFn: async () => (await client.listInvites()).items,
  });
  const create = useMutation({
    mutationFn: (body: { role: InviteRole; expires_in_days: number }) => client.createInvite(body),
    onSuccess: refresh,
  });
  const revoke = useMutation({ mutationFn: (id: string) => client.revokeInvite(id), onSuccess: refresh });
  return { query, create, revoke };
}
