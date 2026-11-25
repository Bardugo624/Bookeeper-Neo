import { useEffect, useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider, TooltipProvider } from '@bookeeper/ui/overlays';
import type { Locale } from '@bookeeper/i18n';
import { PlatformProvider, type Platform } from '../platform';
import { ClientProvider, useSession } from '../session';
import { useTheme } from '../theme';
import { LocaleProvider, useT } from './i18n';
import { createQueryClient } from './queryClient';

function Boot({ platform, children }: { platform: Platform; children: ReactNode }) {
  const init = useSession((s) => s.init);
  const status = useSession((s) => s.status);
  const [queryClient] = useState(createQueryClient);
  useTheme();
  useEffect(() => {
    void init(platform);
  }, [init, platform]);
  // Cached data belongs to the signed-in user: drop it when the session ends.
  useEffect(() => {
    if (status === 'welcome') queryClient.clear();
  }, [status, queryClient]);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/** The single tooltip and toast providers of the app. */
function Overlays({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <TooltipProvider>
      <ToastProvider closeLabel={t('shell.toast.close')}>{children}</ToastProvider>
    </TooltipProvider>
  );
}

export interface AppProvidersProps {
  platform: Platform;
  locale?: Locale;
  children: ReactNode;
}

export function AppProviders({ platform, locale, children }: AppProvidersProps) {
  return (
    <PlatformProvider platform={platform}>
      <LocaleProvider locale={locale}>
        <ClientProvider>
          <Boot platform={platform}>
            <Overlays>{children}</Overlays>
          </Boot>
        </ClientProvider>
      </LocaleProvider>
    </PlatformProvider>
  );
}
