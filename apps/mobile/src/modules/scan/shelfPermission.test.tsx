import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { shelfPlatform, world } from './shelfKit';
import { renderScan } from './testkit';

describe('who may fill a shelf', () => {
  it('a guest has no entry on the scan page', async () => {
    const { platform } = shelfPlatform(world(), { role: 'guest' });
    renderScan(platform);
    await screen.findByText('Inquadra il codice a barre sul retro del libro');
    expect(screen.queryByRole('button', { name: 'Riempi un ripiano' })).toBeNull();
  });

  it('a guest who opens /scan/shelf by hand is told the permission is needed', async () => {
    const { platform } = shelfPlatform(world(), { role: 'guest' });
    renderScan(platform, '/scan/shelf');
    expect(await screen.findByText('Serve il permesso')).toBeInTheDocument();
    expect(platform.camera.open).not.toHaveBeenCalled();
    expect(platform.fake.calls.some((c) => c.path.startsWith('/api/v1/shelves'))).toBe(false);
  });

  it('a member sees the entry and reaches the choice', async () => {
    const user = userEvent.setup();
    const { platform } = shelfPlatform(world(), { role: 'member' });
    const { router } = renderScan(platform);
    await user.click(await screen.findByRole('button', { name: 'Riempi un ripiano' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/scan/shelf'));
    expect(await screen.findByText('Scegli il mobile da riempire.')).toBeInTheDocument();
  });
});
