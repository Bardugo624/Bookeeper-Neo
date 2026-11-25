import { Link } from 'react-router';
import type { BookOut } from '@bookeeper/api';
import { Icon, Skeleton, Tag } from '@bookeeper/ui/base';
import { useT } from '../../app';
import { authorsOf, detailPath, type FromList } from './format';
import type { ListParams, SortKey } from './listParams';
import { SelectionCheckbox } from './SelectionCheckbox';
import { useShelfNames } from './useBook';
import type { Selection } from './useSelection';
import styles from './BookTable.module.css';

const SORTABLE: Array<{ key: SortKey | null; id: 'title' | 'author' | 'year' | 'placement' | 'status' }> = [
  { key: 'title', id: 'title' },
  { key: 'author', id: 'author' },
  { key: 'year', id: 'year' },
  { key: null, id: 'placement' },
  { key: null, id: 'status' },
];

export interface BookTableProps {
  books: BookOut[];
  params: ListParams;
  loadingMore: boolean;
  /** Present while the list is in selection mode: adds a column of checkboxes. */
  selection?: Selection;
}

export function BookTable({ books, params, loadingMore, selection }: BookTableProps) {
  const t = useT();
  const shelves = useShelfNames();
  const state: FromList = { list: params.search };
  const place = (b: BookOut) => {
    if (!b.placement) return t('books.list.unplaced');
    const name = shelves.get(b.placement.shelf_id);
    const row = t('books.detail.where.row', { row: b.placement.row_index + 1 });
    return name ? `${name} · ${row}` : row;
  };
  return (
    <table className={styles.table} aria-label={t('books.list.label')}>
      <thead>
        <tr>
          {selection ? (
            <th scope="col" className={styles.head}>
              <span className={styles.hidden}>{t('books.selection.column')}</span>
            </th>
          ) : null}
          {SORTABLE.map(({ key, id }) => {
            const column = t(`books.list.columns.${id}`);
            const active = key !== null && params.sort === key;
            return (
              <th
                key={id}
                scope="col"
                className={styles.head}
                aria-sort={key === null ? undefined : active ? (params.order === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                {key === null ? (
                  column
                ) : (
                  <button type="button" className={styles.sort} onClick={() => params.toggleSort(key)}>
                    {column}
                    {active ? (
                      <span className={params.order === 'asc' ? styles.asc : styles.desc}>
                        <Icon name="chevron-down" size={14} />
                      </span>
                    ) : null}
                  </button>
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {books.map((b) => (
          <tr key={b.id} className={styles.row}>
            {selection ? (
              <td>
                <SelectionCheckbox
                  label={t('books.selection.select', { title: b.title })}
                  checked={selection.selected.has(b.id)}
                  onToggle={(range) => selection.toggle(b.id, range)}
                />
              </td>
            ) : null}
            <td>
              <Link to={detailPath(b.id)} state={state} className={styles.link}>
                {b.title}
              </Link>
            </td>
            <td>{authorsOf(b)}</td>
            <td>{b.published_year ?? ''}</td>
            <td>{place(b)}</td>
            <td>{b.on_loan ? <Tag tone="warn">{t('books.list.onLoan')}</Tag> : t('books.list.available')}</td>
          </tr>
        ))}
        {loadingMore
          ? Array.from({ length: 4 }, (_, i) => (
              <tr key={`s${i}`} aria-hidden="true">
                <td colSpan={SORTABLE.length + (selection ? 1 : 0)}>
                  <Skeleton shape="line" width="100%" />
                </td>
              </tr>
            ))
          : null}
      </tbody>
    </table>
  );
}

export function TableSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className={styles.skeletonRows}>
      {Array.from({ length: 12 }, (_, i) => (
        <Skeleton key={i} shape="line" width="100%" height={20} />
      ))}
    </div>
  );
}
