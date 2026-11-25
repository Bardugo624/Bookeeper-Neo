import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createClient } from '@bookeeper/api';
import { usePlatform } from '../platform';
import { createAuthTransport } from './authTransport';

export type Client = ReturnType<typeof createClient>;

const ClientContext = createContext<Client | null>(null);

export function ClientProvider({ children }: { children: ReactNode }) {
  const platform = usePlatform();
  const client = useMemo(() => createClient(createAuthTransport(platform)), [platform]);
  return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
}

export function useClient(): Client {
  const c = useContext(ClientContext);
  if (!c) throw new Error('useClient needs a ClientProvider');
  return c;
}
