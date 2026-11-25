import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ISBN13, renderScan, scanPlatform } from './testkit';

const setVisibility = (state: 'hidden' | 'visible') => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  act(() => void document.dispatchEvent(new Event('visibilitychange')));
};

afterEach(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
});

describe('camera lifecycle', () => {
  it('asks for the camera on entering the tab, and not before', async () => {
    const { platform } = scanPlatform();
    const { router } = renderScan(platform, '/');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(platform.camera.open).not.toHaveBeenCalled();
    await act(() => router.navigate('/scan'));
    await waitFor(() => expect(platform.camera.open).toHaveBeenCalledTimes(1));
  });

  it('stops the camera when the tab is left', async () => {
    const { platform, stops } = scanPlatform();
    const { router } = renderScan(platform);
    await waitFor(() => expect(stops).toHaveLength(1));
    await screen.findByText('Inquadra il codice a barre sul retro del libro');
    await act(() => router.navigate('/'));
    expect(stops[0]).toHaveBeenCalledTimes(1);
  });

  it('stops when the page goes to the background, and starts again when it is back', async () => {
    const { platform, stops } = scanPlatform();
    renderScan(platform);
    await screen.findByText('Inquadra il codice a barre sul retro del libro');
    setVisibility('hidden');
    expect(stops[0]).toHaveBeenCalledTimes(1);
    expect(platform.scanner.emit).toBeDefined();
    setVisibility('visible');
    await waitFor(() => expect(stops).toHaveLength(2));
    await screen.findByText('Inquadra il codice a barre sul retro del libro');
    expect(stops[1]).not.toHaveBeenCalled();
  });

  it('leaves no track running after unmount', async () => {
    const { platform, stops } = scanPlatform();
    const { unmount } = renderScan(platform);
    await screen.findByText('Inquadra il codice a barre sul retro del libro');
    unmount();
    expect(stops.every((s) => s.mock.calls.length >= 1)).toBe(true);
  });

  it('shows torch and camera switch only when they can work', async () => {
    const user = userEvent.setup();
    const { platform } = scanPlatform();
    platform.camera.devices = vi.fn(async () => [
      { id: 'rear', label: 'A' },
      { id: 'front', label: 'B' },
    ]);
    renderScan(platform);
    await user.click(await screen.findByRole('button', { name: 'Accendi la torcia' }));
    expect(screen.getByRole('button', { name: 'Spegni la torcia' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(await screen.findByRole('button', { name: 'Cambia fotocamera' }));
    await waitFor(() => expect(platform.camera.open).toHaveBeenLastCalledWith('front'));
  });

  it('ignores a code that is not an ISBN, with a discreet notice', async () => {
    const { platform } = scanPlatform();
    renderScan(platform);
    await screen.findByText('Inquadra il codice a barre sul retro del libro');
    act(() => platform.scanner.emit({ text: '5901234123457', format: 'ean_13' }));
    expect(await screen.findByText('Questo codice non è un ISBN')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(platform.fake.calls.some((c) => c.path.includes(ISBN13))).toBe(false);
  });

  it('gives the same notice for a QR code', async () => {
    const { platform } = scanPlatform();
    renderScan(platform);
    await screen.findByText('Inquadra il codice a barre sul retro del libro');
    act(() => platform.scanner.emit({ text: 'https://example.com', format: 'qr_code' }));
    expect(await screen.findByText('Questo codice non è un ISBN')).toBeInTheDocument();
  });
});

describe('no camera', () => {
  const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' });

  it('explains how to turn the camera back on and takes the ISBN by hand', async () => {
    const user = userEvent.setup();
    const { platform } = scanPlatform();
    platform.camera.open = vi.fn(async () => {
      throw denied;
    });
    renderScan(platform);
    expect(await screen.findByText('Fotocamera non consentita')).toBeInTheDocument();
    expect(screen.getByText(/Riattivala dalle impostazioni/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: "Scrivi l'ISBN a mano" }));
    const field = screen.getByLabelText('ISBN');
    await user.type(field, '9780306406158{Enter}');
    expect(await screen.findByText('Questo ISBN non è valido: controlla le cifre.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.clear(field);
    await user.type(field, '978-0-306-40615-7{Enter}');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(platform.fake.calls.some((c) => c.path.includes(`q=${ISBN13}`))).toBe(true);
  });

  it('asks for the camera again on retry, once the permission is back', async () => {
    const user = userEvent.setup();
    const { platform } = scanPlatform();
    const ok = platform.camera.open;
    platform.camera.open = vi.fn(async () => {
      throw denied;
    });
    renderScan(platform);
    await screen.findByText('Fotocamera non consentita');
    platform.camera.open = ok;
    await user.click(screen.getByRole('button', { name: 'Riprova' }));
    expect(await screen.findByText('Inquadra il codice a barre sul retro del libro')).toBeInTheDocument();
    expect(ok).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Fotocamera non consentita')).toBeNull();
  });

  it('tells a missing camera from a denied one', async () => {
    const { platform } = scanPlatform();
    platform.camera.open = vi.fn(async () => {
      throw new Error('camera_unavailable');
    });
    renderScan(platform);
    expect(await screen.findByText('Fotocamera non disponibile')).toBeInTheDocument();
  });
});
