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

  const check = () => {
    // Registering is safe to repeat; a version already waiting is announced at once.
    serviceWorker.register();
    let waiting = false;
    serviceWorker.onUpdateReady(() => (waiting = true))();
    setOutcome(waiting ? 'updateReady' : 'upToDate');
  };

  return (
    <section className={styles.card} aria-labelledby="account-about">
      <h2 id="account-about" className={styles.heading}>
        {t('maccount.about.title')}
      </h2>
      <ListRow title={pkg.version} subtitle={t('maccount.about.app')} />
      <ListRow title={health.data?.version ?? t('maccount.about.serverUnknown')} subtitle={t('maccount.about.server')} />
      <Button variant="secondary" onClick={check}>
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
