import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DataTable, type Column } from './DataTable';
import { KitWrapper } from './testing';

interface Row {
  id: string;
  title: string;
}
const rows: Row[] = [
  { id: '1', title: 'Dune' },
  { id: '2', title: 'Emma' },
];
const columns: Column<Row>[] = [
  { id: 'title', header: 'Titolo', cell: (r) => r.title, sortable: true },
  { id: 'id', header: 'Codice', cell: (r) => r.id, align: 'end' },
];

function setup(extra: Partial<Parameters<typeof DataTable<Row>>[0]> = {}) {
  return render(
    <KitWrapper>
      <DataTable label="Libri" columns={columns} rows={rows} rowKey={(r) => r.id} {...extra} />
    </KitWrapper>,
  );
}

describe('DataTable', () => {
  it('marks the sorted column with aria-sort', () => {
    setup({ sort: { id: 'title', order: 'desc' } });
    expect(screen.getByRole('columnheader', { name: /Titolo/ })).toHaveAttribute('aria-sort', 'descending');
    expect(screen.getByRole('columnheader', { name: 'Codice' })).not.toHaveAttribute('aria-sort');
  });

  it('reports header clicks', async () => {
    const onSortChange = vi.fn();
    setup({ onSortChange });
    await userEvent.click(screen.getByRole('button', { name: /Titolo/ }));
    expect(onSortChange).toHaveBeenCalledWith('title');
  });

  it('activates a row with Enter', async () => {
    const onRowClick = vi.fn();
    setup({ onRowClick });
    screen.getByRole('row', { name: /Emma/ }).focus();
    await userEvent.keyboard('{Enter}');
    expect(onRowClick).toHaveBeenCalledWith(rows[1]);
  });

  it('shows the empty state', () => {
    setup({ rows: [] });
    expect(screen.getByText('Nessun elemento')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
