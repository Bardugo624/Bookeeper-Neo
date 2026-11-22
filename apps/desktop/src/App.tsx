import { useEffect, useState } from 'react';
import type { Health } from '@bookeeper/api';
import { t, type Locale } from '@bookeeper/i18n';

export interface AppProps {
  client: { health(): Promise<Health> };
  locale: Locale;
}

type Status = { kind: 'loading' } | { kind: 'connected'; version: string } | { kind: 'unreachable' };

export function App({ client, locale }: AppProps) {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    client
      .health()
      .then((h) => {
        if (!cancelled) setStatus({ kind: 'connected', version: h.version });
      })
      .catch(() => {
        if (!cancelled) setStatus({ kind: 'unreachable' });
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  return (
    <main style={{ fontFamily: 'var(--bk-font-ui)', padding: 32 }}>
      <h1 style={{ fontFamily: 'var(--bk-font-serif)', color: 'var(--bk-primary-500)' }}>
        {t(locale, 'app.name')}
      </h1>
      {status.kind === 'connected' && (
        <p>{t(locale, 'status.connected', { version: status.version })}</p>
      )}
      {status.kind === 'unreachable' && <p>{t(locale, 'status.unreachable')}</p>}
    </main>
  );
}
