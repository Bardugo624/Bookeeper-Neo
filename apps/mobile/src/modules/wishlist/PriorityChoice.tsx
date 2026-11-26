import { useId } from 'react';
import { useT } from '../../app/i18n';
import { PRIORITIES } from './model';
import styles from './Wishlist.module.css';

/** Low, medium or high as exclusive buttons, each at least 44px tall. */
export function PriorityChoice({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const t = useT();
  const id = useId();
  return (
    <div className={styles.choice}>
      <span id={id} className={styles.choiceLabel}>
        {t('mwishlist.form.priority')}
      </span>
      <div role="radiogroup" aria-labelledby={id} className={styles.options}>
        {PRIORITIES.map((p, i) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={String(i) === value}
            className={styles.option}
            onClick={() => onChange(String(i))}
          >
            {t(`mwishlist.priority.${p}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
