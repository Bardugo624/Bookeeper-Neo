import { useT } from '../../app/i18n';
import type { StatusActions } from './useStatusActions';
import styles from './Reading.module.css';

/** No state yet: three direct choices. */
export function StatusChoices({ actions }: { actions: StatusActions }) {
  const t = useT();
  const choices = [
    { status: 'to_read', label: t('mreading.pick.to_read') },
    { status: 'reading', label: t('mreading.pick.reading') },
    { status: 'read', label: t('mreading.pick.read') },
  ] as const;
  return (
    <>
      <p className={styles.plain}>{t('mreading.invite')}</p>
      <div className={styles.choices}>
        {choices.map((c) => (
          <button key={c.status} type="button" className={styles.choice} onClick={() => actions.choose(c.status)}>
            {c.label}
          </button>
        ))}
      </div>
    </>
  );
}
