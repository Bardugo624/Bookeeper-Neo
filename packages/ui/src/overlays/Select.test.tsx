import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import './polyfills';
import { Select } from './Select';

const options = [
  { value: 'it', label: 'Italiano' },
  { value: 'en', label: 'English' },
];

it('updates the shown value from the keyboard and reports it', async () => {
  const user = userEvent.setup();
  const onValueChange = vi.fn();
  function Harness() {
    const [value, setValue] = useState('it');
    return (
      <Select
        aria-label="Language"
        options={options}
        value={value}
        onValueChange={(v) => {
          onValueChange(v);
          setValue(v);
        }}
      />
    );
  }
  render(<Harness />);
  const trigger = screen.getByRole('combobox', { name: 'Language' });
  expect(trigger).toHaveTextContent('Italiano');
  trigger.focus();
  await user.keyboard('{Enter}');
  await screen.findByRole('listbox');
  await user.keyboard('{ArrowDown}{Enter}');
  expect(onValueChange).toHaveBeenCalledWith('en');
  expect(trigger).toHaveTextContent('English');
});
