import type { KeyboardEvent, ReactNode } from 'react';
import { EmptyState, Icon } from '@bookeeper/ui/base';
import { useT } from '../app/i18n';
import { cx } from './cx';
import styles from './DataTable.module.css';

export interface Column<Row> {
  id: string;
  header: string;
  cell(row: Row): ReactNode;
  sortable?: boolean;
  align?: 'start' | 'end' | 'center';
  width?: string;
}

export interface SortState {
  id: string;
  order: 'asc' | 'desc';
}

export interface DataTableProps<Row> {
  /** Accessible name of the table. */
  label: string;
  columns: Column<Row>[];
  rows: Row[];
  rowKey(row: Row): string;
  /** Sorting is controlled: the table only reports clicks. */
  sort?: SortState | null;
  onSortChange?(columnId: string): void;
  onRowClick?(row: Row): void;
  /** Replaces the default empty state. */
  empty?: ReactNode;
}

export function DataTable<Row>({ label, columns, rows, rowKey, sort, onSortChange, onRowClick, empty }: DataTableProps<Row>) {
  const t = useT();
  if (rows.length === 0) return <>{empty ?? <EmptyState title={t('common.table.empty')} />}</>;

  const activate = (e: KeyboardEvent<HTMLTableRowElement>, row: Row) => {
    if (e.key === 'Enter' && e.target === e.currentTarget) onRowClick?.(row);
  };

  return (
    <div className={styles.scroll}>
      <table className={styles.table} aria-label={label}>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort?.id === c.id ? sort : null;
              return (
                <th
                  key={c.id}
                  scope="col"
                  className={cx(styles.th, styles[c.align ?? 'start'])}
                  style={c.width ? { width: c.width } : undefined}
                  aria-sort={c.sortable ? (active ? (active.order === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
                >
                  {c.sortable ? (
                    <button type="button" className={styles.sortButton} onClick={() => onSortChange?.(c.id)} title={t('common.table.sortBy', { column: c.header })}>
                      {c.header}
                      {active ? (
                        <span className={cx(styles.arrow, active.order === 'asc' && styles.flip)} aria-hidden="true">
                          <Icon name="chevron-down" size={14} />
                        </span>
                      ) : null}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={cx(styles.row, onRowClick && styles.clickable)}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? (e) => activate(e, row) : undefined}
            >
              {columns.map((c) => (
                <td key={c.id} className={cx(styles.td, styles[c.align ?? 'start'])}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
