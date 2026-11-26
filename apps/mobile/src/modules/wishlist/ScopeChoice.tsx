import { useT } from '../../app/i18n';
import type { Scope } from './model';
import { useRadioKeys } from './useRadioKeys';
import styles from './Wishlist.module.css';

/** "La mia" | "Famiglia" as exclusive buttons. */
export function ScopeChoice({ value, onChange }: { value: Scope; onChange: (scope: Scope) => void }) {
  const t = useT();
  const options: Scope[] = ['mine', 'family'];
  const keys = useRadioKeys(options.length, options.indexOf(value), (i) => onChange(options[i]!));
  return (
    <div role="radiogroup" aria-label={t('mwishlist.scope.label')} className={styles.options}>
      {options.map((scope, i) => (
        <button
          key={scope}
          type="button"
          role="radio"
          {...keys(i)}
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
