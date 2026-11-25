import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateLoan, PatchLoan } from '@bookeeper/api';
import { useClient, useSession } from '../../session';

/** Every write refreshes the loans (list, counts, per-book) and the books (loan flag, counts). */
export function useLoanMutations() {
  const client = useClient();
  const queryClient = useQueryClient();
  const connectionId = useSession((s) => s.connection?.id);
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['loans', connectionId] }),
      queryClient.invalidateQueries({ queryKey: ['books', connectionId] }),
    ]);
  return {
    create: useMutation({ mutationFn: (body: CreateLoan) => client.createLoan(body), onSuccess: refresh }),
    update: useMutation({
      mutationFn: (v: { id: string; patch: PatchLoan }) => client.updateLoan(v.id, v.patch),
      onSuccess: refresh,
    }),
    markReturned: useMutation({
      mutationFn: (v: { id: string; returnedAt: number }) => client.returnLoan(v.id, v.returnedAt),
      onSuccess: refresh,
    }),
    reopen: useMutation({ mutationFn: (id: string) => client.reopenLoan(id), onSuccess: refresh }),
    remove: useMutation({ mutationFn: (id: string) => client.deleteLoan(id), onSuccess: refresh }),
  };
}
