import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { ToastProvider, useToast, type ToastInput } from './Toast';

function Trigger({ toasts }: { toasts: ToastInput[] }) {
  const { show } = useToast();
  return <button onClick={() => toasts.forEach(show)}>Go</button>;
}

function setup(toasts: ToastInput[]) {
  const user = userEvent.setup();
  render(
    <ToastProvider closeLabel="Dismiss">
      <Trigger toasts={toasts} />
    </ToastProvider>,
  );
  return user;
}

afterEach(() => vi.useRealTimers());

it('shows the title in a status region', async () => {
  const user = setup([{ title: 'Saved', description: 'All good' }]);
  await user.click(screen.getByRole('button', { name: 'Go' }));
  expect(screen.getByRole('status')).toHaveTextContent('Saved');
  expect(screen.getByRole('status')).toHaveTextContent('All good');
});

it('puts danger toasts in an alert region', async () => {
  const user = setup([{ title: 'Failed', tone: 'danger' }]);
  await user.click(screen.getByRole('button', { name: 'Go' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Failed');
  expect(screen.getByRole('status')).not.toHaveTextContent('Failed');
});

it('closes from the close button', async () => {
  const user = setup([{ title: 'Saved' }]);
  await user.click(screen.getByRole('button', { name: 'Go' }));
  await user.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(screen.queryByText('Saved')).not.toBeInTheDocument();
});

it('disappears after 5 seconds', () => {
  vi.useFakeTimers();
  setup([{ title: 'Saved' }]);
  fireEvent.click(screen.getByRole('button', { name: 'Go' }));
  act(() => void vi.advanceTimersByTime(4900));
  expect(screen.getByText('Saved')).toBeInTheDocument();
  act(() => void vi.advanceTimersByTime(200));
  expect(screen.queryByText('Saved')).not.toBeInTheDocument();
});

it('pauses while hovered or focused and resumes afterwards', () => {
  vi.useFakeTimers();
  setup([{ title: 'Saved' }]);
  fireEvent.click(screen.getByRole('button', { name: 'Go' }));
  const toast = screen.getByText('Saved').closest('div[class*="toast"]') as HTMLElement;
  fireEvent.mouseEnter(toast);
  act(() => void vi.advanceTimersByTime(20000));
  expect(screen.getByText('Saved')).toBeInTheDocument();
  fireEvent.mouseLeave(toast);
  fireEvent.focus(screen.getByRole('button', { name: 'Dismiss' }));
  act(() => void vi.advanceTimersByTime(20000));
  expect(screen.getByText('Saved')).toBeInTheDocument();
  fireEvent.blur(screen.getByRole('button', { name: 'Dismiss' }));
  act(() => void vi.advanceTimersByTime(5100));
  expect(screen.queryByText('Saved')).not.toBeInTheDocument();
});

it('shows at most three toasts', async () => {
  const user = setup([1, 2, 3, 4].map((n) => ({ title: `Toast ${n}` })));
  await user.click(screen.getByRole('button', { name: 'Go' }));
  expect(screen.getAllByRole('button', { name: 'Dismiss' })).toHaveLength(3);
  expect(screen.queryByText('Toast 4')).not.toBeInTheDocument();
});

it('renders the action as a button; clicking runs it once and closes', async () => {
  const onClick = vi.fn();
  const user = setup([{ title: 'Deleted', action: { label: 'Undo', onClick } }]);
  await user.click(screen.getByRole('button', { name: 'Go' }));
  await user.click(screen.getByRole('button', { name: 'Undo' }));
  expect(onClick).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Deleted')).not.toBeInTheDocument();
});

it('can be activated from the keyboard', async () => {
  const onClick = vi.fn();
  const user = setup([{ title: 'Deleted', action: { label: 'Undo', onClick } }]);
  await user.click(screen.getByRole('button', { name: 'Go' }));
  screen.getByRole('button', { name: 'Undo' }).focus();
  await user.keyboard('{Enter}');
  expect(onClick).toHaveBeenCalledTimes(1);
});

it('lasts 8 seconds when it has an action', () => {
  vi.useFakeTimers();
  setup([{ title: 'Deleted', action: { label: 'Undo', onClick: () => {} } }]);
  fireEvent.click(screen.getByRole('button', { name: 'Go' }));
  act(() => void vi.advanceTimersByTime(7900));
  expect(screen.getByText('Deleted')).toBeInTheDocument();
  act(() => void vi.advanceTimersByTime(200));
  expect(screen.queryByText('Deleted')).not.toBeInTheDocument();
});

it('does not close while the action button has focus', () => {
  vi.useFakeTimers();
  setup([{ title: 'Deleted', action: { label: 'Undo', onClick: () => {} } }]);
  fireEvent.click(screen.getByRole('button', { name: 'Go' }));
  const undo = screen.getByRole('button', { name: 'Undo' });
  fireEvent.focus(undo);
  act(() => void vi.advanceTimersByTime(30000));
  expect(screen.getByText('Deleted')).toBeInTheDocument();
  fireEvent.blur(undo);
  act(() => void vi.advanceTimersByTime(8100));
  expect(screen.queryByText('Deleted')).not.toBeInTheDocument();
});
