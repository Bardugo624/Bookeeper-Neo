import { useEffect, useState } from 'react';
import { useT } from '../../../../app/i18n';
import { usePlatform } from '../../../../platform';
import { SettingsBlock } from '../../SettingsBlock';
import styles from './SharingSection.module.css';

/** «All'accesso»: whether the app opens when the user signs in. Absent where the platform cannot do it. */
export function AutostartBlock() {
  const t = useT();
  const autostart = usePlatform().autostart;
  const [on, setOn] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    autostart
      ?.get()
      .then((v) => {
        if (!live) return;
        setOn(v);
        setReady(true);
      })
      .catch(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, [autostart]);

  if (!autostart) return null;

  const change = async (next: boolean) => {
    const before = on;
    setOn(next);
    setBusy(true);
    setFailed(false);
    try {
      await autostart.set(next);
    } catch {
      setOn(before);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsBlock title={t('sharing.autostart.title')}>
      <label className={styles.toggle}>
        <input
          type="checkbox"
          role="switch"
          checked={on}
          disabled={!ready || busy}
          aria-busy={busy}
          onChange={(e) => void change(e.target.checked)}
        />
        <span>{t('sharing.autostart.toggle')}</span>
      </label>
      <p className={styles.note}>{t('sharing.autostart.note')}</p>
      {failed ? (
        <p className={styles.error} role="alert">
          {t('sharing.autostart.failed')}
        </p>
      ) : null}
    </SettingsBlock>
  );
}
