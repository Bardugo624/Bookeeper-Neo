import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('renders title, count and actions', () => {
    render(<PageHeader title="Libri" count="42 libri" actions={<button>Nuovo</button>} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Libri' })).toBeInTheDocument();
    expect(screen.getByText('42 libri')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nuovo' })).toBeInTheDocument();
  });

  it('omits count and actions when absent', () => {
    render(<PageHeader title="Libri" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });
});
