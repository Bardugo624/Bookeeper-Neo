import { useState } from 'react';
import type { ShelfOut } from '@bookeeper/api';
import { Button, EmptyState, Icon, Skeleton } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { ErrorState, ListRow, apiErrorMessage } from '../../kit';
import { groupByRoom, rowFills } from './shelfRows';
import { useShelfFill, useShelfList } from './useShelfPick';
import type { Target } from './shelfFlow';
import styles from './Shelf.module.css';

export interface PickedRow extends Target {
  shelfName: string;
}

function Loading() {
  const t = useT();
  return (
    <div role="status" aria-label={t('mobile.loading')} className={styles.stack}>
      <Skeleton height={56} />
      <Skeleton height={56} />
    </div>
  );
}

function Rows({ shelf, onPick, onBack }: { shelf: ShelfOut; onPick: (p: PickedRow) => void; onBack: () => void }) {
  const t = useT();
  const fill = useShelfFill(shelf.id);
  const fills = fill.data ? rowFills(shelf, fill.data) : null;
  return (
    <div className={styles.stack}>
      <Button variant="secondary" onClick={onBack}>
        {t('mscan.shelf.pick.change')}
      </Button>
      <h2 className={styles.heading}>{t('mscan.shelf.pick.rowsTitle', { shelf: shelf.name })}</h2>
      {fill.isError ? <ErrorState message={apiErrorMessage(t, fill.error)} onRetry={() => void fill.refetch()} /> : null}
      {!fills && !fill.isError ? <Loading /> : null}
      <ul className={styles.list}>
        {fills?.map((f) => (
          <li key={f.row}>
            <button
              type="button"
              className={styles.rowButton}
              disabled={f.free === 0}
              onClick={() => onPick({ shelfId: shelf.id, shelfName: shelf.name, row: f.row })}
            >
              <span className={styles.rowTitle}>{t('mscan.shelf.pick.row', { row: f.row + 1 })}</span>
              <span className={styles.rowInfo}>
                {t('mscan.shelf.pick.fill', {
                  books: t('mscan.shelf.pick.books', { count: f.books }),
                  free: t('mscan.shelf.pick.free', { count: f.free }),
                })}
              </span>
              {f.free === 0 ? <span className={styles.rowFull}>{t('mscan.shelf.pick.full')}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Which row to fill: the furniture by room, then the rows of the one chosen. */
export function ShelfPicker({ onPick }: { onPick: (p: PickedRow) => void }) {
  const t = useT();
  const list = useShelfList();
  const [chosen, setChosen] = useState<string | null>(null);

  if (list.isError) return <ErrorState message={apiErrorMessage(t, list.error)} onRetry={() => void list.refetch()} />;
  if (!list.data) return <Loading />;
  const shelf = list.data.find((s) => s.id === chosen);
  if (shelf) return <Rows shelf={shelf} onPick={onPick} onBack={() => setChosen(null)} />;
  if (list.data.length === 0) {
    return <EmptyState icon="book" title={t('mscan.shelf.pick.emptyTitle')} text={t('mscan.shelf.pick.emptyText')} />;
  }
  return (
    <div className={styles.stack}>
      <p className={styles.muted}>{t('mscan.shelf.pick.intro')}</p>
      {groupByRoom(list.data).map((g) => (
        <section key={g.room ?? ''} className={styles.stack}>
          <h2 className={styles.heading}>{g.room ?? t('mscan.shelf.pick.noRoom')}</h2>
          <ul className={styles.list}>
            {g.shelves.map((s) => (
              <li key={s.id}>
                <ListRow
                  title={s.name}
                  subtitle={t('mscan.shelf.pick.unitInfo', {
                    rows: t('mscan.shelf.pick.rows', { count: s.rows }),
                    books: t('mscan.shelf.pick.books', { count: s.book_count }),
                  })}
                  leading={<Icon name="grid" size={20} />}
                  onClick={() => setChosen(s.id)}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
