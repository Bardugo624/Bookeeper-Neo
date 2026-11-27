import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockBridge, useInstall, type Scenario } from '../bridge';
import { renderSetup } from '../shell/testing';
import { App } from './App';

function Starter() {
  const { run } = useInstall();
  return (
    <button type="button" onClick={() => void run({ dir: 'C:\\x', desktopIcon: true, autostart: false, mode: 'install' })}>
      start
    </button>
  );
}

const flow = () => document.querySelector('[data-flow]')?.getAttribute('data-flow');

describe('App', () => {
  it.each<[Scenario, string]>([
    ['welcome', 'install'],
    ['older', 'install'],
    ['uninstall', 'uninstall'],
    ['uninstall-remote', 'uninstall'],
  ])('shows the %s scenario in the %s flow', async (scenario, expected) => {
    renderSetup(<App />, { scenario });
    await waitFor(() => expect(flow()).toBe(expected));
  });

  it.each(['elevated', 'incomplete', 'unsupported'] as const)('shows the blocked panel for %s', async (kind) => {
    renderSetup(<App />, { scenario: kind });
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument());
    expect(flow()).toBeUndefined();
    // The title bar’s close and the panel’s own.
    expect(screen.getAllByRole('button', { name: 'Chiudi' })).toHaveLength(2);
  });

  it('says the same in English when the system is English', async () => {
    renderSetup(<App />, { scenario: 'incomplete', locale: 'en' });
    expect(await screen.findByRole('heading', { name: 'The downloaded file is incomplete' })).toBeInTheDocument();
  });

  it('calls ready once, after the first screen', async () => {
    const { bridge } = renderSetup(<App />, { scenario: 'welcome' });
    expect(bridge.calls).not.toContain('ready');
    await waitFor(() => expect(bridge.calls.filter((c) => c === 'ready')).toHaveLength(1));
    expect(flow()).toBe('install');
  });

  describe('a second launch with --uninstall', () => {
    it('switches to the uninstaller when idle', async () => {
      const { bridge } = renderSetup(<App />, { scenario: 'same' });
      await waitFor(() => expect(flow()).toBe('install'));
      act(() => bridge.requestUninstall());
      await waitFor(() => expect(flow()).toBe('uninstall'));
    });

    it('does nothing while an operation runs', async () => {
      const bridge = mockBridge('progress', { tickMs: 20 });
      renderSetup(
        <>
          <App />
          <Starter />
        </>,
        { bridge },
      );
      await waitFor(() => expect(flow()).toBe('install'));
      act(() => screen.getByText('start').click());
      await waitFor(() => expect(screen.getByRole('button', { name: 'Chiudi' })).toBeDisabled());
      act(() => bridge.requestUninstall());
      expect(flow()).toBe('install');
    });
  });

  describe('theme', () => {
    let listener: (() => void) | undefined;
    let matches = false;
    beforeEach(() => {
      matches = false;
      listener = undefined;
      vi.stubGlobal('matchMedia', (query: string) => ({
        get matches() {
          return query.includes('dark') && matches;
        },
        media: query,
        addEventListener: (_: string, fn: () => void) => (listener = fn),
        removeEventListener: () => (listener = undefined),
      }));
    });
    afterEach(() => {
      vi.unstubAllGlobals();
      document.documentElement.classList.remove('dark');
    });

    it('follows the system theme, and its changes', async () => {
      renderSetup(<App />);
      expect(document.documentElement).not.toHaveClass('dark');
      matches = true;
      act(() => listener?.());
      expect(document.documentElement).toHaveClass('dark');
      matches = false;
      act(() => listener?.());
      expect(document.documentElement).not.toHaveClass('dark');
    });

    it('starts dark when the system is dark', () => {
      matches = true;
      renderSetup(<App />);
      expect(document.documentElement).toHaveClass('dark');
    });

    it('is dark in the dark scenario whatever the system says', () => {
      renderSetup(<App />, { scenario: 'dark' });
      expect(document.documentElement).toHaveClass('dark');
    });
  });
});

describe('language', () => {
  it('sets the document language', () => {
    renderSetup(<App />, { locale: 'en' });
    expect(document.documentElement.lang).toBe('en');
  });
});
