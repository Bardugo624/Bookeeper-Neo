import { Fragment } from 'react';
import { Link } from 'react-router';
import type { BookOut } from '@bookeeper/api';
import { Icon, Skeleton, Tag } from '@bookeeper/ui/base';
import { useT } from '../../app';
import { TagChips } from '../tags';
import { authorsOf, detailPath, type FromList } from './format';
import type { ListParams, SortKey } from './listParams';
import { SelectionCheckbox } from './SelectionCheckbox';
import { WhereLink } from './WhereLink';
import { ReadingCell } from './ReadingCell';
import { useShelfNames } from './useBook';
import { useWindowedRows } from './useWindowedRows';
import type { Selection } from './useSelection';
import styles from './BookTable.module.css';

const SORTABLE: Array<{
  key: SortKey | null;
  id: 'title' | 'author' | 'year' | 'placement' | 'reading' | 'tags' | 'status';
}> = [
  { key: 'title', id: 'title' },
  { key: 'author', id: 'author' },
  { key: 'published_year', id: 'year' },
  { key: null, id: 'placement' },
  { key: null, id: 'reading' },
  { key: null, id: 'tags' },
  { key: null, id: 'status' },
];

/** Height of a row (padding, one line of text and the border); a windowed table keeps every row at this height. */
export const ROW_HEIGHT = 41;

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
  const win = useWindowedRows<HTMLTableSectionElement>({
    count: books.length,
    pitch: ROW_HEIGHT,
  });
  const columns = SORTABLE.length + (selection ? 1 : 0);
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
            const column = id === 'tags' ? t('tags.column') : t(`books.list.columns.${id}`);
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
      <tbody ref={win.ref} {...win.handlers}>
        {win.items.map(({ index, gapBefore }) => {
          const b = books[index]!;
          return (
            <Fragment key={b.id}>
              {gapBefore > 0 ? <Spacer height={gapBefore} columns={columns} /> : null}
              <tr className={win.windowed ? styles.fixed : undefined} data-index={index}>
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
                <td>
                  <span className={styles.place}>
                    {place(b)}
                    <WhereLink book={b} />
                  </span>
                </td>
                <td>
                  <ReadingCell reading={b.reading} />
                </td>
                <td className={styles.tags}>
                  <TagChips tags={b.tags} />
                </td>
                <td>{b.on_loan ? <Tag tone="warn">{t('books.list.onLoan')}</Tag> : t('books.list.available')}</td>
              </tr>
            </Fragment>
          );
        })}
        {win.tail > 0 ? <Spacer height={win.tail} columns={columns} /> : null}
        {loadingMore
          ? Array.from({ length: 4 }, (_, i) => (
              <tr key={`s${i}`} aria-hidden="true">
                <td colSpan={columns}>
                  <Skeleton shape="line" width="100%" />
                </td>
              </tr>
            ))
          : null}
      </tbody>
    </table>
  );
}

/** Stands for the rows that are not rendered, so the table keeps its height. */
function Spacer({ height, columns }: { height: number; columns: number }) {
  return (
    <tr aria-hidden="true" style={{ height }}>
      <td colSpan={columns} style={{ padding: 0, border: 0 }} />
    </tr>
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
