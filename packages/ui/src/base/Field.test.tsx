import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Field } from './Field';
import { Input } from './Input';
import { Textarea } from './Textarea';

it('links the label to the input', () => {
  render(
    <Field label="Name">
      <Input />
    </Field>,
  );
  expect(screen.getByLabelText('Name')).toBeInstanceOf(HTMLInputElement);
});

it('marks the input invalid and describes it with the error', () => {
  render(
    <Field label="Name" error="Required" description="Your name">
      <Input />
    </Field>,
  );
  const input = screen.getByLabelText('Name');
  expect(input).toHaveAttribute('aria-invalid', 'true');
  const ids = (input.getAttribute('aria-describedby') ?? '').split(' ');
  const texts = ids.map((id) => document.getElementById(id)?.textContent);
  expect(texts).toContain('Required');
  expect(texts).toContain('Your name');
});

it('has no aria-invalid without an error', () => {
  render(
    <Field label="Name">
      <Input />
    </Field>,
  );
  expect(screen.getByLabelText('Name')).not.toHaveAttribute('aria-invalid');
});

it('works with Textarea', () => {
  render(
    <Field label="Notes" error="Too long">
      <Textarea />
    </Field>,
  );
  expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveAttribute('aria-invalid', 'true');
});
