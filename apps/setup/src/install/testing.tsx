import { vi } from 'vitest';
import type { SetupInfo } from '../bridge';
import { mockBridge, mockInfo, type MockBridge, type Scenario } from '../bridge';
import { renderSetup } from '../shell/testing';
import { InstallFlow } from './index';

/** Renders the install flow over the mock bridge for `scenario`; `onUninstall` is a spy. */
export function renderInstall(scenario: Scenario, patch: Partial<SetupInfo> = {}, bridge?: MockBridge) {
  const onUninstall = vi.fn();
  const info = { ...mockInfo(scenario), ...patch };
  const b = bridge ?? mockBridge(scenario, { tickMs: 5 });
  const view = renderSetup(<InstallFlow info={info} onUninstall={onUninstall} />, { scenario, bridge: b });
  return { ...view, bridge: b, onUninstall };
}

