/** What the account page may offer for putting the app on the Home Screen. */
export type InstallState = 'installed' | 'promptable' | 'ios' | 'none';

export interface Installer {
  state(): InstallState;
  /** Calls `listener` whenever `state()` may have changed. */
  subscribe(listener: () => void): () => void;
  /** Shows the browser's install dialog. Only valid while `state()` is `promptable`. */
  prompt(): Promise<void>;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const STANDALONE = '(display-mode: standalone)';

function isStandalone(): boolean {
  const media = typeof window.matchMedia === 'function' && window.matchMedia(STANDALONE).matches;
  return media || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS 13+ reports itself as a Mac with a touch screen.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * The real browser. It listens from creation on, because `beforeinstallprompt` fires once, soon
 * after load, long before anybody opens the account page.
 */
export function browserInstaller(): Installer {
  let event: BeforeInstallPromptEvent | null = null;
  let installed = isStandalone();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    event = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    event = null;
    notify();
  });

  return {
    state() {
      if (installed) return 'installed';
      if (event) return 'promptable';
      return isIos() ? 'ios' : 'none';
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    async prompt() {
      const current = event;
      if (!current) return;
      await current.prompt();
      const choice = await current.userChoice;
      // The browser lets an event be used once.
      event = null;
      if (choice.outcome === 'accepted') installed = true;
      notify();
    },
  };
}
