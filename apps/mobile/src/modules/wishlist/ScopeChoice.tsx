import { useT } from '../../app/i18n';
import type { Scope } from './model';
import styles from './Wishlist.module.css';

/** "La mia" | "Famiglia" as exclusive buttons. */
export function ScopeChoice({ value, onChange }: { value: Scope; onChange: (scope: Scope) => void }) {
  const t = useT();
  const options: Scope[] = ['mine', 'family'];
  return (
    <div role="radiogroup" aria-label={t('mwishlist.scope.label')} className={styles.options}>
      {options.map((scope) => (
        <button
          key={scope}
          type="button"
          role="radio"
          aria-checked={scope === value}
          className={styles.option}
          onClick={() => onChange(scope)}
        >
          {t(`mwishlist.scope.${scope}`)}
        </button>
      ))}
    </div>
  );
}
