import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { ListRow } from '../../kit';
import { usePlatform } from '../../platform';
import { useClient } from '../../session';
import pkg from '../../../package.json';
import styles from './Account.module.css';

type Outcome = 'upToDate' | 'updateReady' | null;

/** App and server versions, and "Cerca aggiornamenti" through the platform's service worker. */
export function AboutSection() {
  const t = useT();
  const client = useClient();
  const { serviceWorker } = usePlatform();
  const health = useQuery({ queryKey: ['health'], queryFn: () => client.health() });
  const [outcome, setOutcome] = useState<Outcome>(null);

  const [checking, setChecking] = useState(false);

  const check = async () => {
    if (checking) return;
    setChecking(true);
    try {
      setOutcome((await serviceWorker.checkForUpdate()) ? 'updateReady' : 'upToDate');
    } catch {
      setOutcome('upToDate');
    } finally {
      setChecking(false);
    }
  };

  return (
    <section className={styles.card} aria-labelledby="account-about">
      <h2 id="account-about" className={styles.heading}>
        {t('maccount.about.title')}
      </h2>
      <div className={styles.rows}>
        <ListRow title={pkg.version} subtitle={t('maccount.about.app')} />
        <ListRow title={health.data?.version ?? t('maccount.about.serverUnknown')} subtitle={t('maccount.about.server')} />
      </div>
      <Button variant="secondary" onClick={() => void check()} disabled={checking}>
        {t('maccount.about.check')}
      </Button>
      {outcome ? (
        <p className={styles.text} role="status">
          {t(`maccount.about.${outcome}`)}
        </p>
      ) : null}
    </section>
  );
}
