import { act, screen, waitFor } from '@testing-library/react';
import { useQueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import type { IsbnIndex } from '@bookeeper/api';
import { err, entry, renderScan, scanPlatform } from './testkit';
import { memoryIndex, setIndexFactoryForTest } from './libraryIndex';
import { module } from './routes';
import { renderMobile } from '../../app/testing';
import { ok, pair } from '../../session/fixtures';

const answer = (over: Partial<IsbnIndex> = {}): IsbnIndex => ({ version: 'v1', unchanged: false, items: [entry()], ...over });
const syncs = (platform: ReturnType<typeof scanPlatform>['platform']) =>
  platform.fake.calls.filter((c) => c.path.startsWith('/api/v1/books/isbn-index'));

function Invalidate() {
  const qc = useQueryClient();
  return <button onClick={() => void qc.invalidateQueries({ queryKey: ['books', 'l1'] })}>scritto</button>;
}

async function start(server: Parameters<typeof scanPlatform>[0], opts: { online?: boolean } = {}) {
  const index = memoryIndex();
  const { platform } = scanPlatform(server, opts);
  const view = renderScan(platform, '/scan', index);
  await screen.findByText('Inquadra il codice a barre sul retro del libro');
  return { ...view, platform, index };
}

describe('index synchronisation', () => {
  it('downloads the whole index the first time', async () => {
    const { platform, index } = await start({ index: () => ok(answer()) });
    await waitFor(async () => expect(await index.meta()).toMatchObject({ version: 'v1' }));
    expect(await index.get(entry().isbn)).toMatchObject({ title: 'Dune' });
    expect(syncs(platform)[0].path).toBe('/api/v1/books/isbn-index');
  });

  it('sends the stored version and rewrites nothing when unchanged', async () => {
    const index = memoryIndex();
    await index.replace('v1', [entry()], 5);
    const { platform } = scanPlatform({ index: (v) => ok(v === 'v1' ? { version: 'v1', unchanged: true, items: [] } : answer()) });
    renderScan(platform, '/scan', index);
    await waitFor(() => expect(syncs(platform)).toHaveLength(1));
    expect(syncs(platform)[0].path).toBe('/api/v1/books/isbn-index?version=v1');
    await act(async () => {});
    expect(index.replaced).toBe(1);
    expect((await index.meta())?.syncedAt).toBe(5);
  });

  it('fails silently', async () => {
    const { platform, index } = await start({ index: () => err(500, 'internal') });
    await waitFor(() => expect(syncs(platform)).toHaveLength(1));
    expect(screen.queryByRole('alert')?.textContent ?? '').toBe('');
    expect(await index.meta()).toBeNull();
  });

  it('does not ask while offline, and asks when the network comes back', async () => {
    const { platform, index } = await start({ index: () => ok(answer()) }, { online: false });
    await act(async () => {});
    expect(syncs(platform)).toHaveLength(0);
    act(() => platform.network.set(true));
    await waitFor(async () => expect(await index.meta()).toMatchObject({ version: 'v1' }));
  });

  it('asks again after a write on the books', async () => {
    let version = 'v1';
    const index = memoryIndex();
    const { platform } = scanPlatform({ index: () => ok(answer({ version })) });
    setIndexFactoryForTest(() => index);
    pair(platform.storage);
    renderMobile({ platform, modules: [module, { id: 'w', routes: [{ path: '/w', element: <Invalidate /> }] }], route: '/w' });
    await waitFor(() => expect(syncs(platform).length).toBeGreaterThan(0));
    const before = syncs(platform).length;
    version = 'v2';
    act(() => screen.getByRole('button', { name: 'scritto' }).click());
    await waitFor(() => expect(syncs(platform).length).toBeGreaterThan(before));
  });
});
