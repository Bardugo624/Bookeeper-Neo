import { act, configure, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '../../app/AppProviders';
import { fakePlatform, type FakePlatform } from '../../platform/testing';
import type { UpdateState } from '../../platform';
import { UpdateBanner } from './UpdateBanner';
import { CHECK_EVERY_MS } from './controller';

configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 20000 });
const user = userEvent.setup({ delay: null });

const available = (version = '2.1.0', notes = 'Novità\nseconda riga'): UpdateState => ({ state: 'available', version, notes, date: null });

function setup(state: UpdateState): FakePlatform {
  return fakePlatform({ updates: { state } });
}

function mount(platform: FakePlatform) {
  return render(
    <AppProviders platform={platform} locale="it">
      <UpdateBanner />
    </AppProviders>,
  );
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.useRealTimers());

describe('banner', () => {
  it('shows nothing when updates are off', async () => {
    const platform = setup({ state: 'disabled' });
    mount(platform);
    await waitFor(() => expect(platform.updatesFake.checks).toHaveLength(1));
    expect(screen.queryByText(/disponibile Bookeeper/)).toBeNull();
  });

  it('shows nothing where the platform has no updates', () => {
    const platform = fakePlatform();
    mount(platform);
    expect(screen.queryByText(/disponibile Bookeeper/)).toBeNull();
  });

  it('announces an available version', async () => {
    mount(setup(available('2.1.0')));
    expect(await screen.findByText('È disponibile Bookeeper 2.1.0')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Vedi le novità' })).toBeTruthy();
  });

  it('"Più tardi" hides that version only', async () => {
    const platform = setup(available('2.1.0'));
    const first = mount(platform);
    await user.click(await screen.findByRole('button', { name: 'Più tardi' }));
    expect(screen.queryByText('È disponibile Bookeeper 2.1.0')).toBeNull();
    expect(localStorage.getItem('bookeeper.update.dismissed')).toBe('2.1.0');
    first.unmount();

    // After a restart (a new controller reads the stored choice) the same version stays hidden.
    const again = setup(available('2.1.0'));
    const second = mount(again);
    await waitFor(() => expect(again.updatesFake.checks).toHaveLength(1));
    expect(screen.queryByText('È disponibile Bookeeper 2.1.0')).toBeNull();
    second.unmount();

    const next = setup(available('2.2.0'));
    mount(next);
    expect(await screen.findByText('È disponibile Bookeeper 2.2.0')).toBeTruthy();
  });
});

describe('release notes', () => {
  it('are plain text: markup stays text, line breaks are kept, only http(s) links are links', async () => {
    const notes = 'Prima riga <script>alert(1)</script>\n<b>grassetto</b>\nVedi https://example.org/novita. Non così: javascript:alert(1)';
    mount(setup(available('2.1.0', notes)));
    await user.click(await screen.findByRole('button', { name: 'Vedi le novità' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.querySelector('script')).toBeNull();
    expect(dialog.querySelector('b')).toBeNull();
    expect(dialog.textContent).toContain('<script>alert(1)</script>');
    expect(dialog.textContent).toContain('<b>grassetto</b>');
    const links = dialog.querySelectorAll('a');
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute('href')).toBe('https://example.org/novita');
    expect(links[0]!.textContent).toBe('https://example.org/novita');
    expect(dialog.textContent).toContain('javascript:alert(1)');
    expect(dialog.innerHTML).toContain('\n');
  });
});

describe('release notes links', () => {
  it.each([
    ['https://it.wikipedia.org/wiki/Rosa_(nome)', 'https://it.wikipedia.org/wiki/Rosa_(nome)'],
    ['(vedi https://example.org/a)', 'https://example.org/a'],
    ['https://example.org/a.', 'https://example.org/a'],
    ['https://it.wikipedia.org/wiki/Rosa_(nome).', 'https://it.wikipedia.org/wiki/Rosa_(nome)'],
  ])('%s', async (notes, href) => {
    mount(setup(available('2.1.0', notes)));
    await user.click(await screen.findByRole('button', { name: 'Vedi le novità' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.querySelector('a')!.getAttribute('href')).toBe(href);
  });
});

describe('install', () => {
  it('shows progress and cannot be closed meanwhile', async () => {
    const platform = setup(available());
    mount(platform);
    await user.click(await screen.findByRole('button', { name: 'Vedi le novità' }));
    await user.click(await screen.findByRole('button', { name: 'Aggiorna e riavvia' }));
    await waitFor(() => expect(platform.updatesFake.installs).toEqual(['stable']));

    act(() => platform.updatesFake.emitProgress({ downloaded: 25, total: 100 }));
    const bar = await screen.findByRole('progressbar', { name: 'Avanzamento del download' });
    expect((bar as HTMLProgressElement).value).toBe(25);

    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Chiudi' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('says what went wrong for a bad signature and offers a retry', async () => {
    const platform = setup(available());
    platform.updatesFake.setInstall(() => Promise.reject('signature'));
    mount(platform);
    await user.click(await screen.findByRole('button', { name: 'Vedi le novità' }));
    await user.click(await screen.findByRole('button', { name: 'Aggiorna e riavvia' }));
    expect(await screen.findByText(/non ha una firma valida/)).toBeTruthy();

    platform.updatesFake.setInstall(() => new Promise(() => {}));
    await user.click(screen.getByRole('button', { name: 'Riprova' }));
    await waitFor(() => expect(platform.updatesFake.installs).toHaveLength(2));
    expect(screen.queryByText(/non ha una firma valida/)).toBeNull();
  });
});

describe('timer', () => {
  it('checks at start and every 6 hours, never while installing', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const platform = setup({ state: 'up_to_date' });
    const view = mount(platform);
    await act(async () => {});
    expect(platform.updatesFake.checks).toHaveLength(1);

    await act(async () => {
      vi.advanceTimersByTime(CHECK_EVERY_MS);
    });
    expect(platform.updatesFake.checks).toHaveLength(2);
    view.unmount();
  });

  it('skips the tick while an install runs', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const platform = setup(available());
    mount(platform);
    await act(async () => {});
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByRole('button', { name: 'Vedi le novità' }));
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByRole('button', { name: 'Aggiorna e riavvia' }));
    expect(platform.updatesFake.installs).toHaveLength(1);
    await act(async () => {
      vi.advanceTimersByTime(CHECK_EVERY_MS * 2);
    });
    expect(platform.updatesFake.checks).toHaveLength(1);
  });
});
