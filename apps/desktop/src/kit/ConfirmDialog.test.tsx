import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';
import { KitWrapper } from './testing';

function setup(busy = false) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <KitWrapper>
      <ConfirmDialog open title="Eliminare Dune?" description="Non si può annullare." confirmLabel="Elimina libro" tone="danger" busy={busy} onConfirm={onConfirm} onCancel={onCancel} />
    </KitWrapper>,
  );
  return { onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  it('calls the handlers', async () => {
    const { onConfirm, onCancel } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Elimina libro' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Annulla' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons while busy', () => {
    setup(true);
    expect(screen.getByRole('button', { name: 'Annulla' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Elimina libro/ })).toBeDisabled();
  });

  it('cancels with Escape', async () => {
    const { onCancel } = setup();
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
