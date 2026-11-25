import { useT } from '../../app/i18n';
import { PER_SHEET, sheetCount } from './labelsModel';
import styles from './SheetPreview.module.css';

/** Schematic first sheet: the boxes that will carry a label are filled. Shapes only, no PDF. */
export function SheetPreview({ count }: { count: number }) {
  const t = useT();
  const used = Math.min(count, PER_SHEET);
  const sheets = sheetCount(count);
  return (
    <div className={styles.wrap}>
      <div className={styles.sheet} role="img" aria-label={t('labels.preview.label', { used, total: PER_SHEET })}>
        {Array.from({ length: PER_SHEET }, (_, i) => (
          <span key={i} data-testid="label-box" data-used={i < used ? 'true' : 'false'} className={`${styles.box} ${i < used ? styles.used : ''}`} />
        ))}
      </div>
      <p className={styles.caption}>{t('labels.preview.sheets', { count: sheets })}</p>
    </div>
  );
}
