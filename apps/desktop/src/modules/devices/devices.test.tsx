import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QRCode from 'qrcode';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '../../session';
import { device, renderDevices } from './testkit';

const DAY = 86_400;
const nowSec = () => Math.floor(Date.now() / 1000);

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('list', () => {
  const devices = [
    device(1, { name: 'Portatile', current: true, last_seen: nowSec() }),
    device(2, { name: 'Pixel', kind: 'mobile', last_seen: nowSec() - 3 * DAY }),
    device(3, { name: 'Vecchio PC', revoked_at: 1_700_050_000 }),
  ];

  it('marks this device, shows relative time and the count of active devices', async () => {
    renderDevices({ devices });
    expect(await screen.findByRole('heading', { level: 3, name: 'Portatile' })).toBeInTheDocument();
    expect(screen.getByText('2 dispositivi collegati')).toBeInTheDocument();
    expect(screen.getAllByText('Questo dispositivo')).toHaveLength(1);
    expect(screen.getByText('Ultimo accesso: oggi')).toBeInTheDocument();
    expect(screen.getByText('Ultimo accesso: 3 giorni fa')).toBeInTheDocument();
  });

  it('keeps revoked devices in a closed section', async () => {
    renderDevices({ devices });
    await screen.findByText('Portatile');
    const summary = screen.getByText('Revocati (1)');
    const box = summary.closest('details')!;
    expect(box.open).toBe(false);
    expect(within(box).getByText('Vecchio PC')).toBeInTheDocument();
    expect(within(box).queryByRole('button', { name: /Revoca/ })).not.toBeInTheDocument();
    await userEvent.click(summary);
    expect(box.open).toBe(true);
  });

  it('shows an error with a retry', async () => {
    renderDevices({ devices, listFails: true });
    expect(await screen.findByText('Impossibile caricare i dispositivi')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Riprova' })).toBeInTheDocument();
  });

  it('gives guests no way to add a device', async () => {
    renderDevices({ devices, role: 'guest' });
    await screen.findByText('Portatile');
    expect(screen.queryByRole('button', { name: 'Aggiungi un computer' })).not.toBeInTheDocument();
  });
});

describe('rename', () => {
  it('validates the name and sends the trimmed one', async () => {
    const fleet = { devices: [device(1, { name: 'Portatile', current: true })] };
    const { platform } = renderDevices(fleet);
    await userEvent.click(await screen.findByRole('button', { name: 'Rinomina Portatile' }));
    const input = screen.getByRole('textbox', { name: 'Nome del dispositivo' });
    await userEvent.clear(input);
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    expect(await screen.findByText('Scrivi un nome.')).toBeInTheDocument();
    await userEvent.type(input, 'x'.repeat(81));
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    expect(await screen.findByText(/al massimo 80 caratteri/)).toBeInTheDocument();
    await userEvent.clear(input);
    await userEvent.type(input, '  Studio  ');
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    expect(await screen.findByRole('heading', { level: 3, name: 'Studio' })).toBeInTheDocument();
    const patch = platform.calls.filter((c) => c.method === 'PATCH');
    expect(patch).toHaveLength(1);
    expect(patch[0]).toMatchObject({ path: '/api/v1/devices/d1', body: { name: 'Studio' } });
  });
});

describe('revoke', () => {
  const fleet = () => ({ devices: [device(1, { name: 'Portatile', current: true }), device(2, { name: 'Pixel', kind: 'mobile' as const })] });

  it('asks for confirmation, then revokes another device and moves it to the revoked section', async () => {
    const { platform } = renderDevices(fleet());
    await userEvent.click(await screen.findByRole('button', { name: 'Revoca Pixel' }));
    expect(platform.calls.some((c) => c.path.endsWith('/revoke'))).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Revoca' }));
    expect(await screen.findByText('Revocati (1)')).toBeInTheDocument();
    expect(useSession.getState().status).toBe('ready');
  });

  it('warns about the current device and signs out after revoking it', async () => {
    const { platform } = renderDevices(fleet());
    await userEvent.click(await screen.findByRole('button', { name: 'Revoca Portatile' }));
    expect(screen.getByText(/verrai disconnesso/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Revoca' }));
    await waitFor(() => expect(useSession.getState().status).toBe('welcome'));
    expect(platform.calls.some((c) => c.path === '/api/v1/auth/logout')).toBe(true);
  });

  it('asks for the password on confirmation_required and repeats the revoke', async () => {
    const { platform } = renderDevices({ ...fleet(), needsPassword: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Revoca Pixel' }));
    await userEvent.click(screen.getByRole('button', { name: 'Revoca' }));
    await userEvent.type(await screen.findByLabelText('Password'), 'segreta');
    await userEvent.click(screen.getByRole('button', { name: 'Conferma' }));
    expect(await screen.findByText('Revocati (1)')).toBeInTheDocument();
    expect(platform.calls.filter((c) => c.path === '/api/v1/devices/d2/revoke')).toHaveLength(2);
    expect(platform.calls.some((c) => c.path === '/api/v1/auth/confirm')).toBe(true);
    const revokes = platform.calls.filter((c) => c.path === '/api/v1/devices/d2/revoke');
    const header = (i: number) => Object.entries(revokes[i]?.headers ?? {}).find(([k]) => k.toLowerCase() === 'x-confirm-token')?.[1];
    expect(header(0)).toBeUndefined();
    expect(header(1)).toBe('tok');
  });
});

describe('pairing code', () => {
  const base = () => ({ devices: [device(1, { name: 'Portatile', current: true })] });

  it('shows the code grouped, copies it and counts down', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    renderDevices(base());
    // userEvent installs its own clipboard; fake timers must not stall it.
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(await screen.findByRole('button', { name: 'Aggiungi un computer' }));
    expect(await screen.findByText('ABCD 2345')).toBeInTheDocument();
    expect(screen.getByText('Scade tra 10:00')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copia' }));
    expect(await navigator.clipboard.readText()).toBe('ABCD2345');
    await act(async () => {
      vi.advanceTimersByTime(65_000);
    });
    expect(screen.getByText('Scade tra 8:55')).toBeInTheDocument();
  });

  it('dims the code when it expires and generates a new one', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    renderDevices(base());
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(await screen.findByRole('button', { name: 'Aggiungi un computer' }));
    await screen.findByText('ABCD 2345');
    await act(async () => {
      vi.advanceTimersByTime(601_000);
    });
    expect(screen.getByText('Il codice è scaduto.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copia' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Genera un nuovo codice' }));
    expect(await screen.findByText('WXYZ 6789')).toBeInTheDocument();
    expect(screen.queryByText('Il codice è scaduto.')).not.toBeInTheDocument();
  });

  it('goes back to "Copia" after 2 seconds', async () => {
    renderDevices(base());
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Aggiungi un computer' }));
    await screen.findByText('ABCD 2345');
    // Only the timeout is faked, and only now: queries above wait on real timers.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.click(screen.getByRole('button', { name: 'Copia' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: 'Copiato' })).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(1900);
    });
    expect(screen.getByRole('button', { name: 'Copiato' })).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByRole('button', { name: 'Copia' })).toBeInTheDocument();
  });

  it('forgets "Copiato" when the code changes', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    renderDevices(base());
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(await screen.findByRole('button', { name: 'Aggiungi un computer' }));
    await screen.findByText('ABCD 2345');
    await user.click(screen.getByRole('button', { name: 'Copia' }));
    await act(async () => {
      vi.advanceTimersByTime(601_000);
    });
    await user.click(screen.getByRole('button', { name: 'Genera un nuovo codice' }));
    await screen.findByText('WXYZ 6789');
    expect(screen.getByRole('button', { name: 'Copia' })).toBeInTheDocument();
  });

  it('closes with a toast when a new device shows up in the list', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const fleet = base();
    renderDevices(fleet);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(await screen.findByRole('button', { name: 'Aggiungi un computer' }));
    await screen.findByText('ABCD 2345');
    fleet.devices = [device(9, { name: 'Nuovo PC' }), ...fleet.devices];
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(await screen.findByText('Dispositivo aggiunto')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('ABCD 2345')).not.toBeInTheDocument());
    expect(screen.getByText('Nuovo PC')).toBeInTheDocument();
  });

  it('closing the dialog leaves the code alone (no request to revoke it)', async () => {
    const { platform } = renderDevices(base());
    await userEvent.click(await screen.findByRole('button', { name: 'Aggiungi un computer' }));
    await screen.findByText('ABCD 2345');
    await userEvent.click(screen.getAllByRole('button', { name: 'Chiudi' })[0]!);
    await waitFor(() => expect(screen.queryByText('ABCD 2345')).not.toBeInTheDocument());
    expect(platform.calls.filter((c) => c.path.startsWith('/api/v1/pairing'))).toHaveLength(1);
  });

  it('tells the wait on rate_limited', async () => {
    renderDevices({ ...base(), codeFails: { status: 429, code: 'rate_limited', retryAfter: 42 } });
    await userEvent.click(await screen.findByRole('button', { name: 'Aggiungi un computer' }));
    expect(await screen.findByText('Troppi tentativi. Riprova tra 42 secondi.')).toBeInTheDocument();
  });
});

describe('phone', () => {
  it('shows the QR for the public address when the server is ready', async () => {
    const create = vi.spyOn(QRCode, 'create');
    renderDevices({
      devices: [device(1, { current: true })],
      server: { phone_ready: true, public_url: 'https://libreria.example.org/' },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Aggiungi un telefono' }));
    expect(await screen.findByRole('img', { name: /Codice QR/ })).toBeInTheDocument();
    expect(create.mock.calls.at(-1)![0]).toBe('https://libreria.example.org/#/pair?code=ABCD2345');
    expect(screen.getByText('https://libreria.example.org/')).toBeInTheDocument();
    expect(screen.getByText('ABCD 2345')).toBeInTheDocument();
  });

  it('explains instead of offering a dead button when the server is not ready', async () => {
    renderDevices({ devices: [device(1, { current: true })], server: { phone_ready: false, public_url: null } });
    expect(await screen.findByText('Il telefono ha bisogno di un indirizzo sicuro')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aggiungi un telefono' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aggiungi un computer' })).toBeInTheDocument();
  });
});
