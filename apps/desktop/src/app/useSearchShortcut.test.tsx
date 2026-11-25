import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import { expect, it } from 'vitest';
import { useSearchShortcut } from './useSearchShortcut';

function View() {
  const ref = useRef<HTMLInputElement>(null);
  useSearchShortcut(ref);
  return (
    <>
      <input aria-label="search" ref={ref} />
      <input aria-label="other" />
      <button type="button">btn</button>
    </>
  );
}

it('/ focuses the search field and prevents the browser default', async () => {
  render(<View />);
  const ev = new KeyboardEvent('keydown', { key: '/', cancelable: true, bubbles: true });
  document.body.dispatchEvent(ev);
  expect(ev.defaultPrevented).toBe(true);
  expect(screen.getByLabelText('search')).toHaveFocus();
});

it('works from a button', async () => {
  render(<View />);
  await userEvent.click(screen.getByRole('button'));
  await userEvent.keyboard('/');
  expect(screen.getByLabelText('search')).toHaveFocus();
});

it('does not steal the key from another text field', async () => {
  render(<View />);
  await userEvent.click(screen.getByLabelText('other'));
  await userEvent.keyboard('/');
  expect(screen.getByLabelText('other')).toHaveFocus();
  expect(screen.getByLabelText('other')).toHaveValue('/');
});

it('does nothing while a dialog is open, or with a modifier', async () => {
  render(
    <>
      <View />
      <div role="dialog" />
    </>,
  );
  await userEvent.keyboard('/');
  expect(screen.getByLabelText('search')).not.toHaveFocus();
});

it('ignores Ctrl K, which now belongs to the palette', async () => {
  render(<View />);
  await userEvent.keyboard('{Control>}k{/Control}');
  expect(screen.getByLabelText('search')).not.toHaveFocus();
});

it('does nothing when the view registers no field', () => {
  function Bare() {
    useSearchShortcut({ current: null });
    return null;
  }
  render(<Bare />);
  const ev = new KeyboardEvent('keydown', { key: '/', cancelable: true });
  window.dispatchEvent(ev);
  expect(ev.defaultPrevented).toBe(false);
});
