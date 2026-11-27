import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { TitleBar } from './TitleBar';
import { renderSetup } from './testing';

describe('TitleBar', () => {
  it('names the app and is a drag region', () => {
    const { container } = renderSetup(<TitleBar busy={false} />);
    expect(screen.getByText('Bookeeper')).toBeInTheDocument();
    expect(container.querySelector('[data-tauri-drag-region]')).not.toBeNull();
  });

  it('minimizes and closes through the bridge', async () => {
    const { bridge } = renderSetup(<TitleBar busy={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Riduci' }));
    await userEvent.click(screen.getByRole('button', { name: 'Chiudi' }));
    expect(bridge.calls).toEqual(['minimize', 'close']);
  });

  it('turns close off while busy, and says why', async () => {
    const { bridge } = renderSetup(<TitleBar busy />);
    const close = screen.getByRole('button', { name: 'Chiudi' });
    expect(close).toBeDisabled();
    await userEvent.click(close);
    expect(bridge.calls).toEqual([]);
    expect(screen.getByRole('group', { name: "Aspetta la fine dell’installazione" })).toBeInTheDocument();
  });

  it('keeps minimize working while busy', () => {
    renderSetup(<TitleBar busy />);
    expect(screen.getByRole('button', { name: 'Riduci' })).toBeEnabled();
  });
});
