import { act, render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { BridgeProvider, useInstall } from './hooks';
import { mockBridge } from './mock';
import type { InstallRequest, OpResult } from './types';

const request: InstallRequest = { dir: 'C:\\Bookeeper', desktopIcon: true, autostart: false, mode: 'install' };

it('leaves React alone when an operation ends after the provider is gone', async () => {
  let finish!: (result: OpResult) => void;
  const bridge = mockBridge('welcome');
  bridge.install = () => new Promise<OpResult>((resolve) => (finish = resolve));
  let run!: (r: InstallRequest) => Promise<OpResult>;
  function Probe() {
    run = useInstall().run;
    return null;
  }
  const { unmount } = render(
    <BridgeProvider bridge={bridge}>
      <Probe />
    </BridgeProvider>,
  );
  let pending!: Promise<OpResult>;
  act(() => {
    pending = run(request);
  });
  unmount();
  // As after the test environment is torn down: React would need `window` to schedule an update.
  vi.stubGlobal('window', undefined);
  try {
    finish({ ok: true });
    await expect(pending).resolves.toEqual({ ok: true });
  } finally {
    vi.unstubAllGlobals();
  }
});
