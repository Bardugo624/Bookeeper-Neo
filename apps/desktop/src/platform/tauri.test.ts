import { beforeEach, expect, it, vi } from 'vitest';

const invoke = vi.fn();
const isPermissionGranted = vi.fn();
const requestPermission = vi.fn();
const sendNotification = vi.fn();
vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: (...a: unknown[]) => isPermissionGranted(...a),
  requestPermission: (...a: unknown[]) => requestPermission(...a),
  sendNotification: (...a: unknown[]) => sendNotification(...a),
}));
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

it('saveFile calls the command with name, base64 and filters', async () => {
  invoke.mockResolvedValue({ saved: true, path: '/tmp/a.csv' });
  const out = await tauriPlatform().saveFile({
    suggestedName: 'a.csv',
    bytes: new Uint8Array([104, 105]),
    mime: 'text/csv',
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  });
  expect(out).toEqual({ saved: true, path: '/tmp/a.csv' });
  expect(invoke).toHaveBeenCalledWith('save_file', {
    suggested_name: 'a.csv',
    bytes_base64: 'aGk=',
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  });
});

it('saveFile reports a cancelled window as not saved', async () => {
  invoke.mockResolvedValue({ saved: false, path: null });
  const out = await tauriPlatform().saveFile({ suggestedName: 'a', bytes: new Uint8Array(), mime: 'x' });
  expect(out.saved).toBe(false);
});

it('updates call the commands with the channel and turn failures into codes', async () => {
  const { updates } = tauriPlatform();
  invoke.mockResolvedValueOnce({ state: 'up_to_date' });
  expect(await updates!.check('beta')).toEqual({ state: 'up_to_date' });
  expect(invoke).toHaveBeenCalledWith('update_check', { channel: 'beta' });

  invoke.mockRejectedValueOnce('invalid update channel');
  expect(await updates!.check('stable')).toEqual({ state: 'error', code: 'manifest' });

  invoke.mockRejectedValueOnce('signature');
  await expect(updates!.install('stable')).rejects.toBe('signature');
  invoke.mockRejectedValueOnce('anything else');
  await expect(updates!.install('stable')).rejects.toBe('install');
});

it('autostart calls its two commands', async () => {
  const { autostart } = tauriPlatform();
  invoke.mockResolvedValueOnce(true);
  expect(await autostart!.get()).toBe(true);
  expect(invoke).toHaveBeenCalledWith('autostart_get');
  invoke.mockResolvedValueOnce(undefined);
  await autostart!.set(false);
  expect(invoke).toHaveBeenCalledWith('autostart_set', { on: false });
});

it('notifications use the plugin and tell denied from prompt', async () => {
  const { notifications } = tauriPlatform();
  isPermissionGranted.mockResolvedValueOnce(true);
  expect(await notifications!.permission()).toBe('granted');

  isPermissionGranted.mockResolvedValue(false);
  vi.stubGlobal('Notification', { permission: 'default' });
  expect(await notifications!.permission()).toBe('prompt');
  vi.stubGlobal('Notification', { permission: 'denied' });
  expect(await notifications!.permission()).toBe('denied');
  vi.unstubAllGlobals();

  requestPermission.mockResolvedValueOnce('granted');
  expect(await notifications!.request()).toBe('granted');
  requestPermission.mockResolvedValueOnce('default');
  expect(await notifications!.request()).toBe('denied');
  requestPermission.mockRejectedValueOnce(new Error('x'));
  expect(await notifications!.request()).toBe('denied');

  await notifications!.send({ title: 'T', body: 'B' });
  expect(sendNotification).toHaveBeenCalledWith({ title: 'T', body: 'B' });
});
