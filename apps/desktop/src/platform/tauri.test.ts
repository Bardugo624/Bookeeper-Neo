import { beforeEach, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({}) }));

const { tauriPlatform } = await import('./tauri');

beforeEach(() => invoke.mockReset());

it('a missing probe command is a handled network error', async () => {
  invoke.mockRejectedValueOnce('command server_probe not found');
  expect(await tauriPlatform().probe('http://x')).toMatchObject({ reachable: false, error: 'network' });
});

it('a missing discover command gives an empty list', async () => {
  invoke.mockRejectedValueOnce('command discover not found');
  expect(await tauriPlatform().discover()).toEqual([]);
});

it('calls the connection commands by name', async () => {
  invoke.mockResolvedValue({ active: null, items: [] });
  const p = tauriPlatform();
  await p.connections.get();
  await p.connections.activate('a');
  await p.connections.remove('a');
  expect(invoke.mock.calls.map((c) => c[0])).toEqual(['connections_get', 'connection_activate', 'connection_remove']);
  expect(invoke).toHaveBeenCalledWith('connection_activate', { id: 'a' });
});
