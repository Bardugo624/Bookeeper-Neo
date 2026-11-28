import { useEffect, useState } from 'react';
import { useT } from '../../../../app/i18n';
import { usePlatform } from '../../../../platform';
import { SettingsBlock } from '../../SettingsBlock';
import styles from './SharingSection.module.css';

/** The login-opening choice: read on mount, then changed by `change`. A failed read leaves the switch off but usable. */
function useAutostart() {
  const autostart = usePlatform().autostart;
  const [on, setOn] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<'read' | 'set' | null>(null);

  useEffect(() => {
    let live = true;
    autostart?.get().then(
      (v) => {
        if (!live) return;
        setOn(v);
        setReady(true);
      },
      () => {
        if (!live) return;
        setProblem('read');
        setReady(true);
      },
    );
    return () => {
      live = false;
    };
  }, [autostart]);

  const change = async (next: boolean) => {
    if (!autostart) return;
    const before = on;
    setOn(next);
    setBusy(true);
    setProblem(null);
    try {
      await autostart.set(next);
    } catch {
      setOn(before);
      setProblem('set');
    } finally {
      setBusy(false);
    }
  };

  return { available: !!autostart, on, ready, busy, problem, change };
}

/** «All'accesso»: whether the app opens when the user signs in. Absent where the platform cannot do it. */
export function AutostartBlock() {
  const t = useT();
  const { available, on, ready, busy, problem, change } = useAutostart();

  if (!available) return null;

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
      {problem ? (
        <p className={styles.error} role="alert">
          {t(problem === 'read' ? 'sharing.autostart.readFailed' : 'sharing.autostart.failed')}
        </p>
      ) : null}
    </SettingsBlock>
  );
}
