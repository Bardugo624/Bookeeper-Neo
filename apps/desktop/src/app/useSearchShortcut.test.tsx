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
    </>
  );
}

it.each([['{Control>}k{/Control}'], ['{Meta>}k{/Meta}']])('%s focuses the search field', async (keys) => {
  render(<View />);
  await userEvent.keyboard(keys);
  expect(screen.getByLabelText('search')).toHaveFocus();
});

it('works from another text field and prevents the browser default', async () => {
  render(<View />);
  await userEvent.click(screen.getByLabelText('other'));
  const ev = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true, bubbles: true });
  screen.getByLabelText('other').dispatchEvent(ev);
  expect(ev.defaultPrevented).toBe(true);
  expect(screen.getByLabelText('search')).toHaveFocus();
});

it('does nothing when the view registers no field', () => {
  function Bare() {
    useSearchShortcut({ current: null });
    return null;
  }
  render(<Bare />);
  const ev = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true });
  window.dispatchEvent(ev);
  expect(ev.defaultPrevented).toBe(false);
});
