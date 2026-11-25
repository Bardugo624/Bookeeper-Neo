import { useEffect, useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@bookeeper/ui/overlays';
import type { Locale } from '@bookeeper/i18n';
import { PlatformProvider, type Platform } from '../platform';
import { ClientProvider, useSession } from '../session';
import { LocaleProvider, useT } from './i18n';
import { NeedsHttps } from './NeedsHttps';
import { createQueryClient } from './queryClient';
import { useTheme } from './theme';

function Boot({ platform, children }: { platform: Platform; children: ReactNode }) {
  const init = useSession((s) => s.init);
  const status = useSession((s) => s.status);
  const [queryClient] = useState(createQueryClient);
  useTheme();
  useEffect(() => {
    platform.serviceWorker.register();
    void init(platform);
  }, [init, platform]);
  // Cached data belongs to the paired library: drop it when the session ends.
  useEffect(() => {
    if (status === 'unpaired') queryClient.clear();
  }, [status, queryClient]);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function Overlays({ children }: { children: ReactNode }) {
  const t = useT();
  return <ToastProvider closeLabel={t('mobile.close')}>{children}</ToastProvider>;
}

export interface AppProvidersProps {
  platform: Platform;
  locale?: Locale;
  children: ReactNode;
}

/** Without a secure context nothing below is mounted: no session, no request. */
export function AppProviders({ platform, locale, children }: AppProvidersProps) {
  return (
    <PlatformProvider platform={platform}>
      <LocaleProvider locale={locale}>
        {platform.secure ? (
          <ClientProvider>
            <Boot platform={platform}>
              <Overlays>{children}</Overlays>
            </Boot>
          </ClientProvider>
        ) : (
          <NeedsHttps />
        )}
      </LocaleProvider>
    </PlatformProvider>
  );
}
