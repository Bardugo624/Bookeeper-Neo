import { useEffect, useRef, useState } from 'react';
import { TooltipProvider } from '@bookeeper/ui/overlays';
import {
  useBusy,
  useForcedTheme,
  useReady,
  useSetupInfo,
  useUninstallRequested,
  type SetupInfo,
} from '../bridge';
import { InstallFlow } from '../install';
import { BlockedPanel, TitleBar } from '../shell';
import { UninstallFlow } from '../uninstall';
import { useTheme } from './useTheme';

/** Calls `ready` once, after the first screen has been drawn: the window stays hidden until then. */
function useReadyAfterFirstPaint(drawn: boolean): void {
  const ready = useReady();
  const called = useRef(false);
  useEffect(() => {
    if (!drawn || called.current) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        called.current = true;
        void ready();
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [drawn, ready]);
}

function Flow({ info, uninstallAsked, onUninstall }: { info: SetupInfo; uninstallAsked: boolean; onUninstall(): void }) {
  if (info.blocked) return <BlockedPanel kind={info.blocked} />;
  if (uninstallAsked || info.mode === 'uninstall') return <UninstallFlow info={{ ...info, mode: 'uninstall' }} />;
  return <InstallFlow info={info} onUninstall={onUninstall} />;
}

/** Reads `setup_info`, then picks the blocked panel, the install flow or the uninstall flow. */
export function App() {
  const state = useSetupInfo();
  const busy = useBusy();
  const [uninstallAsked, setUninstallAsked] = useState(false);
  useTheme(useForcedTheme());

  // A second launch with --uninstall only switches flow when nothing is running.
  const idle = useRef(true);
  idle.current = !busy;
  useUninstallRequested(() => {
    if (idle.current) setUninstallAsked(true);
  });

  useReadyAfterFirstPaint(state.status !== 'loading');

  return (
    <TooltipProvider>
      <TitleBar busy={busy} />
      {state.status === 'ready' ? (
        <Flow info={state.value} uninstallAsked={uninstallAsked} onUninstall={() => setUninstallAsked(true)} />
      ) : state.status === 'error' ? (
        // setup_info failed: the safest advice is a fresh download.
        <BlockedPanel kind="incomplete" />
      ) : null}
    </TooltipProvider>
  );
}
