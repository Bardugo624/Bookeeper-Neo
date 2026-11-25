import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import './polyfills';
import { PillTabs, type PillTabsProps } from './PillTabs';

const items = [
  { id: 'all', label: 'All' },
  { id: 'reading', label: 'Reading', dot: 'var(--bk-ok)' },
  { id: 'done', label: 'Done' },
];

function Harness({ onChange, ...rest }: Partial<PillTabsProps> & { onChange?: (id: string) => void }) {
  const [value, setValue] = useState('all');
  return (
    <PillTabs
      items={items}
      value={value}
      onChange={(id) => {
        onChange?.(id);
        setValue(id);
      }}
      {...rest}
    />
  );
}

describe.each(['pill', 'segmented'] as const)('%s variant', (variant) => {
  it('exposes tablist and tabs with aria-selected', () => {
    render(<Harness variant={variant} label="Filters" />);
    expect(screen.getByRole('tablist', { name: 'Filters' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Done' })).toHaveAttribute('aria-selected', 'false');
  });

  it('keeps a single tab in the tab order', () => {
    render(<Harness variant={variant} />);
    const stops = screen.getAllByRole('tab').filter((t) => t.tabIndex === 0);
    expect(stops).toHaveLength(1);
    expect(stops[0]).toHaveAccessibleName('All');
  });

  it('wraps with arrows and supports Home and End', async () => {
    const user = userEvent.setup();
    render(<Harness variant={variant} />);
    screen.getByRole('tab', { name: 'All' }).focus();
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Done' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'All' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Done' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'All' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
  });

  it('calls onChange with the id on click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness variant={variant} onChange={onChange} />);
    await user.click(screen.getByRole('tab', { name: 'Reading' }));
    expect(onChange).toHaveBeenCalledWith('reading');
    expect(screen.getByRole('tab', { name: 'Reading' })).toHaveAttribute('aria-selected', 'true');
  });

  it('has exactly one indicator whatever the number of tabs', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `t${i}`, label: `Tab ${i}` }));
    const { container } = render(<PillTabs items={many} value="t3" onChange={() => {}} variant={variant} />);
    expect(container.querySelectorAll('[data-pill-indicator]')).toHaveLength(1);
  });
});

it('keeps icon-only tabs named', () => {
  render(<PillTabs items={[{ id: 'grid', label: 'Grid', icon: 'grid', iconOnly: true }]} value="grid" onChange={() => {}} variant="segmented" />);
  expect(screen.getByRole('tab', { name: 'Grid' })).toBeInTheDocument();
});
