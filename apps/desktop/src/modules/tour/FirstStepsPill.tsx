import { IconButton } from '@bookeeper/ui/base';
import { Menu } from '@bookeeper/ui/overlays';
import { useT } from '../../app/i18n';
import styles from './FirstStepsPill.module.css';
import { useTour, useTourBinding } from './store';

const R = 9;
const CIRCUMFERENCE = 2 * Math.PI * R;

/** «Primi passi» for the sidebar: there while the tour is paused; a click picks it up again. */
export function FirstStepsPill() {
  const t = useT();
  useTourBinding();
  const { status, step, total, resume, skip } = useTour();
  if (status !== 'paused' || total === 0) return null;
  const n = Math.min(step + 1, total);
  return (
    <div className={styles.pill}>
      <button type="button" className={styles.main} onClick={resume}>
        <svg className={styles.ring} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle className={styles.track} cx="12" cy="12" r={R} />
          <circle className={styles.value} cx="12" cy="12" r={R} strokeDasharray={`${(CIRCUMFERENCE * n) / total} ${CIRCUMFERENCE}`} />
        </svg>
        <span className={styles.label}>{t('tour.pill.label')}</span>
        <span className={styles.progress}>{t('tour.pill.progress', { n, total })}</span>
      </button>
      <Menu
        trigger={<IconButton icon="more" size="sm" label={t('tour.pill.more')} />}
        items={[{ id: 'dismiss', label: t('tour.dismiss'), onSelect: skip }]}
      />
    </div>
  );
}
