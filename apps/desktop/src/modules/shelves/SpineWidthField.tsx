import { useT } from '../../app';
import styles from './ShelvesPage.module.css';

/** The choices of the spine width: null draws it from the page count. */
export const WIDTH_CHOICES = [
  { value: null, key: 'pages' },
  { value: 1, key: 'thin' },
  { value: 2, key: 'medium' },
  { value: 3, key: 'wide' },
] as const;

export interface SpineWidthFieldProps {
  value: number | null;
  onChange(width: number | null): void;
}

/** "Spine width": four radio choices. */
export function SpineWidthField({ value, onChange }: SpineWidthFieldProps) {
  const t = useT();
  return (
    <fieldset className={styles.widths}>
      <legend className={styles.widthsLegend}>{t('shelves.spine.width.label')}</legend>
      {WIDTH_CHOICES.map((c) => (
        <label key={c.key} className={styles.widthChoice}>
          <input type="radio" name="spine-width" checked={value === c.value} onChange={() => onChange(c.value)} />
          {t(`shelves.spine.width.${c.key}`)}
        </label>
      ))}
    </fieldset>
  );
}
