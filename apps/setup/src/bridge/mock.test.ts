import { describe, expect, it } from 'vitest';
import { mockBridge, mockInfo, scenarioFromHash, SCENARIOS } from './mock';
import type { SetupInfo } from './types';

function valid(info: SetupInfo): void {
  expect(['install', 'uninstall']).toContain(info.mode);
  expect(info.defaults.dir).toMatch(/^[A-Z]:\\/);
  expect(info.data.bytes).toBeGreaterThanOrEqual(0);
  if (info.mode === 'install' && !info.blocked) expect(info.payload).not.toBeNull();
  if (info.mode === 'uninstall') expect(info.payload).toBeNull();
  if (info.installed) expect(info.installed.version).toMatch(/^\d+\.\d+\.\d+$/);
  expect([null, 'elevated', 'incomplete', 'unsupported']).toContain(info.blocked);
}

describe('mockBridge', () => {
  it.each(SCENARIOS)('returns a valid SetupInfo for %s', async (scenario) => {
    valid(await mockBridge(scenario).setupInfo());
  });

  it('describes each case', () => {
    expect(mockInfo('older').installed?.version).toBe('2.1.0');
    expect(mockInfo('legacy').installed?.legacy).toBe(true);
    expect(mockInfo('uninstall-ebooks').data.hasEbooks).toBe(true);
    expect(mockInfo('uninstall-remote').data.hasLibrary).toBe(false);
    expect(mockInfo('elevated').blocked).toBe('elevated');
    expect(mockInfo('welcome').installed).toBeNull();
  });

  it('reads the scenario from the address', () => {
    expect(scenarioFromHash('#scenario=uninstall-ebooks')).toBe('uninstall-ebooks');
    expect(scenarioFromHash('#scenario=nope')).toBe('welcome');
    expect(scenarioFromHash('')).toBe('welcome');
  });

  it('streams progress to the end, then finishes', async () => {
    const bridge = mockBridge('done', { tickMs: 1 });
    const seen: number[] = [];
    let finished = false;
    await bridge.onProgress((e) => {
      seen.push(e.fraction);
      finished ||= e.done;
    });
    const result = await bridge.install({ dir: 'C:\\x', desktopIcon: true, autostart: false, mode: 'install' });
    expect(result).toEqual({ ok: true });
    expect(finished).toBe(true);
    expect(seen[seen.length - 1]).toBe(1);
  });

  it('fails the error scenario and blocks the first install of the running one', async () => {
    const req = { dir: 'C:\\x', desktopIcon: true, autostart: false, mode: 'install' as const };
    expect(await mockBridge('error').install(req)).toEqual({ ok: false, error: 'nsis_failed', code: 5 });
    const running = mockBridge('running', { tickMs: 1 });
    expect(await running.install(req)).toEqual({ ok: false, error: 'app_running' });
    expect(await running.install(req)).toEqual({ ok: true });
  });

  it('checks folders', async () => {
    const check = await mockBridge('welcome').checkDir('\\\\server\\share');
    expect(check.problem).toBe('network');
  });
});
