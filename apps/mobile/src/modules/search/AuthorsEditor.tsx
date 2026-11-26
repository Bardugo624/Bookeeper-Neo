import { Icon } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { LIMITS } from './editModel';
import styles from './Edit.module.css';

/** Authors, one input per line, with "Aggiungi autore" at the end. */
export function AuthorsEditor({ value, error, onChange }: { value: string[]; error?: string; onChange: (next: string[]) => void }) {
  const t = useT();
  const set = (i: number, text: string) => onChange(value.map((a, j) => (j === i ? text : a)));
  return (
    <fieldset className={styles.group}>
      <legend className={styles.label}>{t('msearch.edit.authors')}</legend>
      {value.map((author, i) => (
        <div key={i} className={styles.authorRow}>
          <input
            name={i === 0 ? 'authors' : undefined}
            className={styles.input}
            aria-label={t('msearch.edit.authorN', { n: i + 1 })}
            aria-invalid={i === 0 && error ? true : undefined}
            autoCapitalize="words"
            value={author}
            onChange={(e) => set(i, e.target.value)}
          />
          <button
            type="button"
            className={styles.iconButton}
            aria-label={t('msearch.edit.removeAuthor', { n: i + 1 })}
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
      ))}
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      <button type="button" className={styles.add} disabled={value.length >= LIMITS.authors} onClick={() => onChange([...value, ''])}>
        <Icon name="plus" size={16} />
        {t('msearch.edit.addAuthor')}
      </button>
    </fieldset>
  );
}
