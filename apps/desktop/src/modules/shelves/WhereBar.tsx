import { useEffect } from 'react';
import type { ShelfOut } from '@bookeeper/api';
import { Button, Icon } from '@bookeeper/ui/base';
import { useT } from '../../app';
import { wherePhrase } from './wherePhrase';
import type { WhereState } from './useWhere';
import styles from './WhereBar.module.css';

export interface WhereBarProps {
  state: WhereState;
  shelf: ShelfOut;
  /** Null without write permission: "Place in…" is not offered. */
  onPlace: (() => void) | null;
  onDone: () => void;
  /** A dialog is open: Esc belongs to it. */
  blocked: boolean;
}

/** The line over the unit that says where the pulled-out book stands, with "Done". Esc is "Done". */
export function WhereBar({ state, shelf, onPlace, onDone, blocked }: WhereBarProps) {
  const t = useT();
  useEffect(() => {
    if (!state || blocked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onDone();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state, blocked, onDone]);

  if (!state) return null;
  const text =
    state.kind === 'here'
      ? wherePhrase(t, { ...state, shelfName: shelf.name }, state.title)
      : state.kind === 'unplaced'
        ? t('shelves.where.none', { title: state.book.title })
        : state.kind === 'gone'
          ? t('shelves.where.gone')
          : t('shelves.where.error');
  return (
    <div className={styles.bar}>
      <p role="status" className={styles.text}>
        <Icon name="pin" size={14} />
        {text}
      </p>
      {state.kind === 'unplaced' && onPlace ? <Button onClick={onPlace}>{t('shelves.where.place')}</Button> : null}
      {state.kind === 'error' ? <Button onClick={state.retry}>{t('common.retry')}</Button> : null}
      <Button variant="secondary" onClick={onDone}>
        {t('shelves.where.done')}
      </Button>
    </div>
  );
}
