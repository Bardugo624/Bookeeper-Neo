import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BackupConfig } from '@bookeeper/api';
import { useClient, useSession } from '../../../../session';

/** Root of this section's queries; the restore invalidates the whole connection instead. */
function useBackupKey() {
  const connectionId = useSession((s) => s.connection?.id);
  return ['backup', connectionId] as const;
}

export function useBackupConfig() {
  const client = useClient();
  const key = useBackupKey();
  return useQuery({ queryKey: [...key, 'config'], retry: false, queryFn: () => client.getBackupConfig() });
}

export function useBackupList() {
  const client = useClient();
  const key = useBackupKey();
  return useQuery({ queryKey: [...key, 'list'], retry: false, queryFn: () => client.listBackups() });
}

export function useSaveBackupConfig() {
  const client = useClient();
  const queryClient = useQueryClient();
  const key = useBackupKey();
  return useMutation({
    mutationFn: (config: BackupConfig) => client.setBackupConfig(config),
    onSuccess: (saved) => queryClient.setQueryData([...key, 'config'], saved),
  });
}
