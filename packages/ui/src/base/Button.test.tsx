import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { Button } from './Button';

it('activates with click, Enter and Space', async () => {
  const onClick = vi.fn();
  const user = userEvent.setup();
  render(<Button onClick={onClick}>Save</Button>);
  const button = screen.getByRole('button', { name: 'Save' });
  await user.click(button);
  expect(onClick).toHaveBeenCalledTimes(1);
  button.focus();
  await user.keyboard('{Enter}');
  expect(onClick).toHaveBeenCalledTimes(2);
  await user.keyboard(' ');
  expect(onClick).toHaveBeenCalledTimes(3);
});

it('is disabled while loading and shows a named spinner', async () => {
  const onClick = vi.fn();
  render(
    <Button loading loadingLabel="Saving" onClick={onClick}>
      Save
    </Button>,
  );
  const button = screen.getByRole('button');
  expect(button).toBeDisabled();
  expect(screen.getByRole('status', { name: 'Saving' })).toBeInTheDocument();
  await userEvent.setup().click(button);
  expect(onClick).not.toHaveBeenCalled();
});

it('does not call onClick when disabled', async () => {
  const onClick = vi.fn();
  render(
    <Button disabled onClick={onClick}>
      Save
    </Button>,
  );
  await userEvent.setup().click(screen.getByRole('button', { name: 'Save' }));
  expect(onClick).not.toHaveBeenCalled();
});

it('renders an icon as decorative', () => {
  const { container } = render(<Button icon="plus">Add</Button>);
  expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
});

it('requires loadingLabel when loading and names the spinner with it', () => {
  // @ts-expect-error loading without loadingLabel must not compile
  const bad = <Button loading>Save</Button>;
  expect(bad).toBeTruthy();
  render(<Button loading loadingLabel="Salvataggio">Save</Button>);
  expect(screen.getByRole('status', { name: 'Salvataggio' })).toBeInTheDocument();
});

it('adds the danger tone class to ghost and secondary only when asked', () => {
  const { rerender } = render(<Button variant="ghost" tone="danger">Del</Button>);
  expect(screen.getByRole('button', { name: 'Del' }).className).toMatch(/toneDanger/);
  rerender(<Button variant="secondary" tone="danger">Del</Button>);
  expect(screen.getByRole('button', { name: 'Del' }).className).toMatch(/toneDanger/);
  rerender(<Button variant="secondary">Del</Button>);
  expect(screen.getByRole('button', { name: 'Del' }).className).not.toMatch(/toneDanger/);
  rerender(<Button variant="danger" tone="danger">Del</Button>);
  expect(screen.getByRole('button', { name: 'Del' }).className).not.toMatch(/toneDanger/);
});
