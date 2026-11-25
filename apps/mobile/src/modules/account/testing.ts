import { vi } from 'vitest';
import type { InstallState, Installer } from './install';

export interface FakeInstaller extends Installer {
  prompt: ReturnType<typeof vi.fn<() => Promise<void>>>;
  set(state: InstallState): void;
}

/** An installer with no browser behind it. */
export function fakeInstaller(initial: InstallState = 'none'): FakeInstaller {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    state: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    prompt: vi.fn(async () => undefined),
    set(next) {
      state = next;
      listeners.forEach((l) => l());
    },
  };
}
