import { useRef, type FormEvent } from 'react';
import { Icon } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { useDebouncedQuery } from './useDebouncedQuery';
import styles from './SearchField.module.css';

export interface SearchFieldProps {
  value: string;
  onCommit: (q: string) => void;
}

/** The search box: commits 250 ms after the typing paused; "Search" on the keyboard commits and closes it. */
export function SearchField({ value, onCommit }: SearchFieldProps) {
  const t = useT();
  const ref = useRef<HTMLInputElement>(null);
  const { text, setText, clear, flush } = useDebouncedQuery(value, onCommit);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    flush();
    ref.current?.blur();
  };

  return (
    <form role="search" className={styles.field} onSubmit={submit}>
      <span className={styles.lens} aria-hidden="true">
        <Icon name="search" size={18} />
      </span>
      <input
        ref={ref}
        type="search"
        role="searchbox"
        className={styles.input}
        aria-label={t('msearch.field.label')}
        placeholder={t('msearch.field.placeholder')}
        enterKeyHint="search"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {text ? (
        <button
          type="button"
          className={styles.clear}
          aria-label={t('msearch.field.clear')}
          onClick={() => {
            clear();
            ref.current?.focus();
          }}
        >
          <Icon name="close" size={18} />
        </button>
      ) : null}
    </form>
  );
}
