import { useRef } from 'react';
import { Icon, IconButton, Input, Kbd } from '@bookeeper/ui/base';
import { useSearchShortcut, useT } from '../../app';
import { useDebouncedQuery } from './useDebouncedQuery';
import styles from './SearchField.module.css';

export interface SearchFieldProps {
  value: string;
  onCommit: (q: string) => void;
}

function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
}

export function SearchField({ value, onCommit }: SearchFieldProps) {
  const t = useT();
  const ref = useRef<HTMLInputElement>(null);
  useSearchShortcut(ref);
  const { text, setText, clear } = useDebouncedQuery(value, onCommit);
  return (
    <div className={styles.field}>
      <span className={styles.lens}>
        <Icon name="search" size={16} />
      </span>
      <Input
        ref={ref}
        type="text"
        role="searchbox"
        className={styles.input}
        aria-label={t('books.search.label')}
        placeholder={t('books.search.placeholder')}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {text ? (
        <IconButton icon="close" size="sm" label={t('books.search.clear')} className={styles.clear} onClick={clear} />
      ) : (
        <Kbd className={styles.hint}>{t(isMac() ? 'books.search.hintMac' : 'books.search.hint')}</Kbd>
      )}
    </div>
  );
}
