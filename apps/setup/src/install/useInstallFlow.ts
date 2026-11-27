import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useDirCheck,
  useInstall,
  useLaunchApp,
  useLogTail,
  usePickFolder,
  useProgress,
  useQuit,
  type InstallRequest,
  type Mode,
  type SetupInfo,
} from '../bridge';
import { useQuotes, type QuoteRef } from '../shell';

export type Screen = 'welcome' | 'customize' | 'running' | 'progress' | 'done' | 'error' | 'maintenance';

interface Choices {
  dir: string;
  desktopIcon: boolean;
  autostart: boolean;
}

/** The install flow's state machine: which panel shows, what was chosen and what the last request was. */
export function useInstallFlow(info: SetupInfo) {
  const { run } = useInstall();
  const progress = useProgress();
  const pickFolder = usePickFolder();
  const logTail = useLogTail();
  const launchApp = useLaunchApp();
  const quit = useQuit();
  const { pick } = useQuotes();

  const [screen, setScreen] = useState<Screen>(info.installed ? 'maintenance' : 'welcome');
  const [choices, setChoices] = useState<Choices>(info.defaults);
  const [quote, setQuote] = useState<QuoteRef>(() => pick('welcome'));
  const [copied, setCopied] = useState(false);
  // The folder is only checked once the person has looked at the choices, then again at every pick,
  // even of the same folder: a check that failed can pass the next time.
  const [looked, setLooked] = useState(false);
  const [picks, setPicks] = useState(0);
  const check = useDirCheck(looked ? choices.dir : null, picks);
  const dir = check?.dir ?? choices.dir;

  const last = useRef<InstallRequest | null>(null);
  const [mode, setMode] = useState<Mode>('install');

  const start = useCallback(
    async (request: InstallRequest) => {
      last.current = request;
      setMode(request.mode);
      setQuote(pick('progress'));
      setScreen('progress');
      const result = await run(request);
      if (result.ok) return; // «Fatto» waits for the last progress event
      if (result.error === 'app_running') {
        setScreen('running');
      } else {
        setCopied(false);
        setScreen('error');
      }
    },
    [pick, run],
  );

  // Only an event with `done: true` ends the progress; the quote moves on with each step, at most every 6 s.
  const step = progress?.step;
  useEffect(() => {
    if (screen === 'progress' && step) setQuote(pick('progress'));
  }, [screen, step, pick]);
  useEffect(() => {
    if (screen === 'progress' && progress?.done) setScreen('done');
  }, [screen, progress?.done]);

  const maintenanceRequest = (m: Mode): InstallRequest => ({
    dir: info.installed?.dir ?? dir,
    desktopIcon: info.defaults.desktopIcon,
    autostart: info.defaults.autostart,
    mode: m,
  });

  return {
    screen,
    quote,
    choices: { ...choices, dir },
    check,
    checking: looked && check === null,
    mode,
    copied,
    customize() {
      setLooked(true);
      setScreen('customize');
    },
    less: () => setScreen('welcome'),
    setDesktopIcon: (desktopIcon: boolean) => setChoices((c) => ({ ...c, desktopIcon })),
    setAutostart: (autostart: boolean) => setChoices((c) => ({ ...c, autostart })),
    async changeFolder() {
      const picked = await pickFolder(dir);
      if (!picked) return;
      setChoices((c) => ({ ...c, dir: picked }));
      setPicks((n) => n + 1);
    },
    /** A known folder problem sends the person back to the choices instead of installing. */
    install() {
      // The folder is only trusted once `check_dir` has answered: it adds `\Bookeeper` and validates the path.
      if (check?.problem || (looked && !check)) {
        setScreen('customize');
        return;
      }
      void start({ dir, desktopIcon: choices.desktopIcon, autostart: choices.autostart, mode: 'install' });
    },
    update: () => void start(maintenanceRequest('update')),
    repair: () => void start(maintenanceRequest('repair')),
    retry() {
      if (last.current) void start(last.current);
    },
    async copyDetails() {
      try {
        await navigator.clipboard.writeText(await logTail());
        setCopied(true);
      } catch {
        setCopied(false);
      }
    },
    openApp: () => void launchApp(),
    close: () => void quit(0),
  };
}
