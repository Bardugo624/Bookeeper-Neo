import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import './polyfills';
import { Tooltip } from './Tooltip';

it('appears on keyboard focus and describes the trigger', async () => {
  const user = userEvent.setup();
  render(
    <Tooltip content={<><strong>Dune</strong><span>Herbert · 412</span></>}>
      <button>Spine</button>
    </Tooltip>,
  );
  await user.tab();
  const button = screen.getByRole('button', { name: 'Spine' });
  expect(button).toHaveFocus();
  const tip = await screen.findByRole('tooltip');
  expect(tip).toHaveTextContent('Dune');
  expect(button).toHaveAccessibleDescription(/Dune/);
});
