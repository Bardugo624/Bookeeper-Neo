import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FormDialog } from './FormDialog';
import { KitWrapper } from './testing';

function setup(extra: Partial<Parameters<typeof FormDialog>[0]> = {}) {
  const onSubmit = vi.fn((e: { preventDefault(): void }) => e.preventDefault());
  const onCancel = vi.fn();
  render(
    <KitWrapper>
      <FormDialog open title="Nuovo" onSubmit={onSubmit} onCancel={onCancel} {...extra}>
        <input aria-label="Nome" />
      </FormDialog>
    </KitWrapper>,
  );
  return { onSubmit, onCancel };
}

describe('FormDialog', () => {
  it('submits the form from the footer button', async () => {
    const { onSubmit } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('cancels with the button and with Escape', async () => {
    const { onCancel } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Annulla' }));
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('shows the general error', () => {
    setup({ error: 'Qualcosa non va' });
    expect(screen.getByRole('alert')).toHaveTextContent('Qualcosa non va');
  });

  it('does not close with Escape while busy', async () => {
    const { onCancel } = setup({ busy: true });
    await userEvent.keyboard('{Escape}');
    expect(onCancel).not.toHaveBeenCalled();
  });
});
