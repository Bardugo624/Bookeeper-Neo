import { useSyncExternalStore } from 'react';
import { Button } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import type { Installer } from './install';
import styles from './Account.module.css';

/** Offers the Home Screen install; absent when installed or when the browser has no way to do it. */
export function InstallSection({ installer }: { installer: Installer }) {
  const t = useT();
  const state = useSyncExternalStore(installer.subscribe, installer.state);
  if (state === 'installed' || state === 'none') return null;
  return (
    <section className={styles.card} aria-labelledby="account-install">
      <h2 id="account-install" className={styles.heading}>
        {t('maccount.install.title')}
      </h2>
      {state === 'promptable' ? (
        <>
          <p className={styles.text}>{t('maccount.install.text')}</p>
          <Button variant="primary" onClick={() => void installer.prompt()}>
            {t('maccount.install.action')}
          </Button>
        </>
      ) : (
        <>
          <p className={styles.text}>{t('maccount.install.iosTitle')}</p>
          <ol className={styles.steps}>
            <li>{t('maccount.install.ios1')}</li>
            <li>{t('maccount.install.ios2')}</li>
            <li>{t('maccount.install.ios3')}</li>
          </ol>
        </>
      )}
    </section>
  );
}
