import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import './polyfills';
import { Popover } from './Popover';

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <p>page</p>
      <Popover open={open} onOpenChange={setOpen} label="Look" trigger={<button>Aa</button>}>
        <button>inside</button>
      </Popover>
    </div>
  );
}

it('popover_opens_from_its_trigger_closes_on_escape_and_returns_focus', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const trigger = screen.getByRole('button', { name: 'Aa' });
  await user.click(trigger);
  const pop = await screen.findByRole('dialog', { name: 'Look' });
  expect(pop).toBeInTheDocument();
  expect(screen.getByText('page').closest('div')).not.toHaveAttribute('aria-hidden');
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  await user.click(trigger);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await user.click(trigger);
  await screen.findByRole('dialog');
  await user.click(screen.getByText('page'));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
