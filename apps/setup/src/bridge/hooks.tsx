import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Bridge, DirCheck, FolderProblem, InstallRequest, OpResult, ProgressEvent, SetupInfo } from './types';

interface OperationState {
  progress: ProgressEvent | null;
  busy: boolean;
  begin(): void;
  end(): void;
}

const BridgeContext = createContext<Bridge | null>(null);
const OperationContext = createContext<OperationState | null>(null);

/** Holds the bridge, the last progress event and whether an operation is running. */
export function BridgeProvider({ bridge, children }: { bridge: Bridge; children: ReactNode }) {
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [running, setRunning] = useState(0);
  // An operation can end after the provider is gone; React must not hear of it then.
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    void bridge.onProgress(setProgress).then((unlisten) => {
      if (cancelled) unlisten();
      else stop = unlisten;
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [bridge]);

  const operation = useMemo<OperationState>(
    () => ({
      progress,
      busy: running > 0,
      begin() {
        if (!mounted.current) return;
        setProgress(null);
        setRunning((n) => n + 1);
      },
      end: () => {
        if (mounted.current) setRunning((n) => Math.max(0, n - 1));
      },
    }),
    [progress, running],
  );

  return (
    <BridgeContext.Provider value={bridge}>
      <OperationContext.Provider value={operation}>{children}</OperationContext.Provider>
    </BridgeContext.Provider>
  );
}

function useBridge(): Bridge {
  const bridge = useContext(BridgeContext);
  if (!bridge) throw new Error('BridgeProvider is missing');
  return bridge;
}

function useOperation(): OperationState {
  const operation = useContext(OperationContext);
  if (!operation) throw new Error('BridgeProvider is missing');
  return operation;
}

/** The theme the bridge insists on (the `dark` preview scenario), if any. */
export function useForcedTheme(): 'dark' | undefined {
  return useBridge().forcedTheme;
}

export type Loaded<T> = { status: 'loading' } | { status: 'ready'; value: T } | { status: 'error' };

export function useSetupInfo(): Loaded<SetupInfo> {
  const bridge = useBridge();
  const [state, setState] = useState<Loaded<SetupInfo>>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    bridge.setupInfo().then(
      (value) => live && setState({ status: 'ready', value }),
      () => live && setState({ status: 'error' }),
    );
    return () => {
      live = false;
    };
  }, [bridge]);
  return state;
}

/** What the UI knows about a folder: the answer of `check_dir`, or the problem `unknown` when the call itself failed. */
export type FolderCheck = Omit<DirCheck, 'problem'> & { problem: FolderProblem | 'unknown' | null };

/** Checks `dir` whenever it changes or `attempt` moves on; null while the answer is on its way. */
export function useDirCheck(dir: string | null, attempt = 0): FolderCheck | null {
  const bridge = useBridge();
  const [result, setResult] = useState<FolderCheck | null>(null);
  useEffect(() => {
    if (dir === null) {
      setResult(null);
      return;
    }
    let live = true;
    setResult(null);
    bridge.checkDir(dir).then(
      (check) => live && setResult(check),
      () => live && setResult({ dir, problem: 'unknown', freeBytes: 0, drive: '' }),
    );
    return () => {
      live = false;
    };
  }, [bridge, dir, attempt]);
  return result;
}

export function usePickFolder(): (current?: string) => Promise<string | null> {
  const bridge = useBridge();
  return useCallback((current) => bridge.pickDir(current), [bridge]);
}

const FAILED: OpResult = { ok: false, error: 'io' };

export interface Operation<A> {
  run(arg: A): Promise<OpResult>;
  busy: boolean;
}

function useOperationRunner<A>(call: (bridge: Bridge, arg: A) => Promise<OpResult>): Operation<A> {
  const bridge = useBridge();
  const operation = useOperation();
  const latest = useRef(operation);
  latest.current = operation;
  const run = useCallback(
    async (arg: A) => {
      latest.current.begin();
      try {
        return await call(bridge, arg);
      } catch {
        return FAILED;
      } finally {
        latest.current.end();
      }
    },
    [bridge, call],
  );
  return { run, busy: operation.busy };
}

const callInstall = (bridge: Bridge, request: InstallRequest) => bridge.install(request);
const callUninstall = (bridge: Bridge, deleteData: boolean) => bridge.uninstall(deleteData);

export function useInstall(): Operation<InstallRequest> {
  return useOperationRunner(callInstall);
}

export function useUninstall(): Operation<boolean> {
  return useOperationRunner(callUninstall);
}

/** The latest progress event, or null before the first one. */
export function useProgress(): ProgressEvent | null {
  return useOperation().progress;
}

/** True while an install or uninstall is running. */
export function useBusy(): boolean {
  return useOperation().busy;
}

export function useLogTail(): () => Promise<string> {
  const bridge = useBridge();
  return useCallback(() => bridge.logTail().catch(() => ''), [bridge]);
}

export function useLaunchApp(): () => Promise<void> {
  const bridge = useBridge();
  return useCallback(() => bridge.launchApp(), [bridge]);
}

export function useQuit(): (code?: number) => Promise<void> {
  const bridge = useBridge();
  return useCallback((code = 0) => bridge.quit(code), [bridge]);
}

export function useReady(): () => Promise<void> {
  const bridge = useBridge();
  return useCallback(() => bridge.ready(), [bridge]);
}

export function useWindowControls(): { minimize(): void; close(): void } {
  const bridge = useBridge();
  return useMemo(
    () => ({
      minimize: () => void bridge.minimize(),
      close: () => void bridge.close(),
    }),
    [bridge],
  );
}

/** Calls `handler` when a second launch asks for the uninstaller. */
export function useUninstallRequested(handler: () => void): void {
  const bridge = useBridge();
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    void bridge.onUninstallRequested(() => latest.current()).then((unlisten) => {
      if (cancelled) unlisten();
      else stop = unlisten;
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [bridge]);
}
