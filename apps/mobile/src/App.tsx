import { useEffect, useState } from 'react';
import type { Health } from '@bookeeper/api';
import { t, type Locale } from '@bookeeper/i18n';

export interface AppProps {
  client: { health(): Promise<Health> };
  locale: Locale;
  /** `window.isSecureContext`: without HTTPS the phone cannot use the app. */
  secure: boolean;
}

type Status = { kind: 'loading' } | { kind: 'connected'; version: string } | { kind: 'unreachable' };

export function App({ client, locale, secure }: AppProps) {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  useEffect(() => {
    if (!secure) return;
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
  }, [client, secure]);

  return (
    <main style={{ fontFamily: 'var(--bk-font-ui)', padding: 24 }}>
      <h1 style={{ fontFamily: 'var(--bk-font-serif)', color: 'var(--bk-primary-500)' }}>
        {t(locale, 'app.name')}
      </h1>
      {!secure && <p>{t(locale, 'mobile.needsHttps')}</p>}
      {secure && status.kind === 'connected' && (
        <p>{t(locale, 'status.connected', { version: status.version })}</p>
      )}
      {secure && status.kind === 'unreachable' && <p>{t(locale, 'status.unreachable')}</p>}
    </main>
  );
}
