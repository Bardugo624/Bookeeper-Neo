import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import './polyfills';
import { Drawer } from './Drawer';

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <Drawer open={open} onOpenChange={setOpen} title="Details" description="Rename it" closeLabel="Close" footer={<button>Save</button>}>
        <input aria-label="Name" />
      </Drawer>
    </>
  );
}

it('opens with a named dialog role and moves focus inside', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'Open' }));
  const dialog = await screen.findByRole('dialog', { name: 'Details' });
  expect(dialog).toHaveAccessibleDescription('Rename it');
  expect(dialog.contains(document.activeElement)).toBe(true);
  expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
});

it('closes with Escape and returns focus to the opener', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const opener = screen.getByRole('button', { name: 'Open' });
  await user.click(opener);
  await screen.findByRole('dialog');
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await waitFor(() => expect(opener).toHaveFocus());
});

it('closes from the close button', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'Open' }));
  await user.click(await screen.findByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
