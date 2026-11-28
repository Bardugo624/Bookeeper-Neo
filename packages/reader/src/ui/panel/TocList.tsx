import { useEffect, useRef } from 'react';
import type { TocItem } from '../../engine/protocol';
import { useReaderLocale, useReaderT } from '../../i18n';
import { formatPercent } from '../view/format';
import styles from './TocList.module.css';

export interface TocListProps {
  items: readonly TocItem[];
  /** The `href` of the chapter being read. */
  current: string | null;
  onGo: (href: string) => void;
}

function Level({ items, current, onGo, depth }: TocListProps & { depth: number }) {
  const locale = useReaderLocale();
  return (
    <ul className={styles.list} style={{ '--depth': depth } as React.CSSProperties}>
      {items.map((item, i) => {
        const here = item.href === current;
        return (
          <li key={`${item.href}:${i}`}>
            <button
              type="button"
              className={styles.row}
              aria-current={here ? 'location' : undefined}
              data-current={here || undefined}
              onClick={() => onGo(item.href)}
            >
              <span className={styles.label}>{item.label}</span>
              {item.fraction === null ? null : (
                <span className={styles.percent}>{formatPercent(item.fraction, locale)}</span>
              )}
            </button>
            {item.children.length > 0 ? (
              <Level items={item.children} current={current} onGo={onGo} depth={depth + 1} />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** The chapters, nested, each with the percentage where it starts; the current one is tinted and kept in view. */
export function TocList({ items, current, onGo }: TocListProps) {
  const t = useReaderT();
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    root.current?.querySelector('[aria-current="location"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [current, items]);
  return (
    <nav ref={root} className={styles.toc} aria-label={t('rpanel.toc.label')}>
      {items.length === 0 ? (
        <p className={styles.empty}>{t('rpanel.toc.empty')}</p>
      ) : (
        <Level items={items} current={current} onGo={onGo} depth={0} />
      )}
    </nav>
  );
}
