import type { BookOut } from '@bookeeper/api';
import { useT } from '../../app/i18n';
import { apiErrorMessage } from '../../kit';
import { useStatusActions } from './useStatusActions';
import styles from './Reading.module.css';

/** No state yet: three direct choices. */
export function StatusChoices({ book }: { book: BookOut }) {
  const t = useT();
  const actions = useStatusActions(book, null);
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
      {actions.error ? (
        <p role="alert" className={styles.error}>
          {apiErrorMessage(t, actions.error)}
        </p>
      ) : null}
    </>
  );
}
