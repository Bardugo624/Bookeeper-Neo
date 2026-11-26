import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { Button } from './Button';
import { DangerAction, DangerZone } from './DangerZone';

it('is a region named by its title, with icon, title and description', () => {
  const { container } = render(<DangerZone title="Danger zone" description="Cannot be undone" />);
  expect(screen.getByRole('region', { name: 'Danger zone' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 3, name: 'Danger zone' })).toBeInTheDocument();
  expect(screen.getByText('Cannot be undone')).toBeInTheDocument();
  expect(container.querySelector('svg')).not.toBeNull();
});

it('uses the requested heading level and omits the description when absent', () => {
  const { container } = render(<DangerZone title="Zone" headingLevel="h2" />);
  expect(screen.getByRole('heading', { level: 2, name: 'Zone' })).toBeInTheDocument();
  expect(container.querySelector('p')).toBeNull();
});

it('shows a DangerAction with title, consequence and a working command', async () => {
  const onClick = vi.fn();
  render(
    <DangerZone title="Zone">
      <DangerAction title="Delete shelf" consequence="Books stay in the library." action={<Button variant="danger" onClick={onClick}>Delete</Button>} />
    </DangerZone>,
  );
  expect(screen.getByText('Delete shelf')).toBeInTheDocument();
  expect(screen.getByText('Books stay in the library.')).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Delete' }));
  expect(onClick).toHaveBeenCalledTimes(1);
});

it('insets loose children like a row, without touching DangerAction rows', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync('src/base/DangerZone.module.css', 'utf8');
  const actions = css.match(/\.actions\s*\{([^}]*)\}/)?.[1] ?? '';
  expect(actions).not.toMatch(/padding|border/);
  const loose = css.match(/\.actions > :not\(\.row\)\s*\{([^}]*)\}/)?.[1] ?? '';
  expect(loose).toMatch(/padding:\s*12px 16px/);
  const gap = css.match(/\.actions > :not\(\.row\) \+ :not\(\.row\)\s*\{([^}]*)\}/)?.[1] ?? '';
  expect(gap).toMatch(/margin-top:\s*12px/);
  const { container } = render(
    <DangerZone title="Zone">
      <input type="file" aria-label="File" />
      <DangerAction title="T" consequence="C" action={<button>Go</button>} />
    </DangerZone>,
  );
  const actionsEl = container.querySelector('[class*="actions"]')!;
  expect(actionsEl.contains(screen.getByLabelText('File'))).toBe(true);
  expect(actionsEl.querySelector('[class*="row"]')).not.toBeNull();
});
