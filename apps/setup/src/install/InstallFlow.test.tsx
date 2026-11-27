import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockBridge, mockInfo, useBusy, type DirCheck } from '../bridge';
import { TitleBar } from '../shell';
import { renderSetup } from '../shell/testing';
import { InstallFlow } from './index';
import { renderInstall } from './testing';

const heading = () => screen.getByRole('heading', { level: 1 });

describe('welcome', () => {
  it('shows the folder and the icons, and no autostart line while it is off', () => {
    renderInstall('welcome');
    expect(heading()).toHaveTextContent('Installa Bookeeper');
    expect(screen.getByText('Versione 2.2.0 · 41 MB')).toBeInTheDocument();
    expect(screen.getByText('C:\\Users\\Giulia\\AppData\\Local\\Bookeeper')).toBeInTheDocument();
    expect(screen.getByText('Icona sul desktop e nel menu Start')).toBeInTheDocument();
    expect(screen.queryByText('Si apre all.accesso a Windows')).not.toBeInTheDocument();
  });

  it('says so when the app will open at sign-in, and names only Start without the desktop icon', () => {
    renderInstall('welcome', { defaults: { dir: 'C:\\Bk', desktopIcon: false, autostart: true } });
    expect(screen.getByText('Nel menu Start')).toBeInTheDocument();
    expect(screen.getByText(/Si apre all.accesso a Windows/)).toBeInTheDocument();
  });

  it('installs with the default choices', async () => {
    const request = vi.fn();
    const bridge = mockBridge('welcome', { tickMs: 5 });
    const install = bridge.install.bind(bridge);
    bridge.install = (r) => (request(r), install(r));
    renderInstall('welcome', {}, bridge);
    await userEvent.click(screen.getByRole('button', { name: 'Installa' }));
    expect(request).toHaveBeenCalledWith({
      dir: 'C:\\Users\\Giulia\\AppData\\Local\\Bookeeper',
      desktopIcon: true,
      autostart: false,
      mode: 'install',
    });
  });

  it('puts the focus on the title', () => {
    renderInstall('welcome');
    expect(heading()).toHaveFocus();
  });
});

describe('progress and done', () => {
  it('does not reach «Fatto» before an event says done, and the title bar is busy meanwhile', async () => {
    const bridge = mockBridge('welcome', { tickMs: 5 });
    let finish: () => void = () => undefined;
    bridge.install = () => new Promise((resolve) => (finish = () => resolve({ ok: true })));
    const { container } = renderInstall('welcome', {}, bridge);
    await userEvent.click(screen.getByRole('button', { name: 'Installa' }));
    expect(await screen.findByRole('heading', { name: 'Sto installando Bookeeper' })).toHaveFocus();

    act(() => bridge.emitProgress({ step: 'copy', fraction: 0.58, done: false }));
    expect(await screen.findByText('Copio i file')).toBeInTheDocument();
    expect(screen.getByText('58%')).toBeInTheDocument();
    act(() => finish());
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(screen.queryByRole('heading', { name: 'Bookeeper è pronto' })).not.toBeInTheDocument();
    expect(container.querySelector('[data-screen]')).toHaveAttribute('data-screen', 'progress');

    act(() => bridge.emitProgress({ step: 'finish', fraction: 1, done: true }));
    expect(await screen.findByRole('heading', { name: 'Bookeeper è pronto' })).toHaveFocus();
  });

  it('shows the sentence with the desktop icon, and «Apri Bookeeper» launches the app', async () => {
    const { bridge } = renderInstall('welcome');
    await userEvent.click(screen.getByRole('button', { name: 'Installa' }));
    expect(await screen.findByRole('heading', { name: 'Bookeeper è pronto' })).toBeInTheDocument();
    expect(screen.getByText('Lo trovi sul desktop e nel menu Start.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Apri Bookeeper' }));
    expect(bridge.calls).toContain('launchApp');
    await userEvent.click(screen.getByRole('button', { name: 'Chiudi' }));
    expect(bridge.calls).toContain('quit:0');
  });

  it('shows the sentence without the desktop icon', async () => {
    renderInstall('welcome', { defaults: { dir: 'C:\\Bk', desktopIcon: false, autostart: false } });
    await userEvent.click(screen.getByRole('button', { name: 'Installa' }));
    expect(await screen.findByText('Lo trovi nel menu Start.')).toBeInTheDocument();
  });
});

function WithTitleBar() {
  const busy = useBusy();
  return (
    <>
      <TitleBar busy={busy} />
      <InstallFlow info={mockInfo('welcome')} onUninstall={() => undefined} />
    </>
  );
}

describe('the title bar', () => {
  it('is busy while the work runs and free again at the end', async () => {
    renderSetup(<WithTitleBar />, { scenario: 'welcome' });
    expect(screen.getByRole('button', { name: 'Chiudi' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Installa' }));
    await screen.findByRole('heading', { name: 'Sto installando Bookeeper' });
    expect(screen.getByRole('group', { name: "Aspetta la fine dell'installazione" })).toBeInTheDocument();
    await screen.findByRole('heading', { name: 'Bookeeper è pronto' });
    await waitFor(() => expect(screen.queryByRole('group', { name: "Aspetta la fine dell'installazione" })).not.toBeInTheDocument());
  });
});

describe('the app is open', () => {
  it('asks to close it, and «Riprova» runs the same request again', async () => {
    const { bridge } = renderInstall('running');
    await userEvent.click(screen.getByRole('button', { name: 'Installa' }));
    expect(await screen.findByRole('heading', { name: 'Chiudi Bookeeper per continuare' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Riprova' }));
    expect(await screen.findByRole('heading', { name: 'Bookeeper è pronto' })).toBeInTheDocument();
    expect(bridge.calls.filter((c) => c === 'install:install')).toHaveLength(2);
  });
});

describe('an error', () => {
  const writeText = vi.fn(() => Promise.resolve());
  beforeEach(() => {
    writeText.mockClear();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  });
  afterEach(() => Reflect.deleteProperty(navigator, 'clipboard'));

  it('stops, copies the log and tries again', async () => {
    const { bridge } = renderInstall('error');
    await userEvent.click(screen.getByRole('button', { name: 'Installa' }));
    expect(await screen.findByRole('heading', { name: "L'installazione si è fermata" })).toHaveFocus();

    await userEvent.click(screen.getByRole('button', { name: 'Copia i dettagli' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('nsis exited with code 5')));
    expect(await screen.findByRole('button', { name: 'Dettagli copiati' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Riprova' }));
    await waitFor(() => expect(bridge.calls.filter((c) => c === 'install:install')).toHaveLength(2));
  });
});

describe('customize', () => {
  it('opens the tall panel, and «Meno scelte» keeps what was chosen', async () => {
    const { container } = renderInstall('welcome');
    await userEvent.click(screen.getByRole('button', { name: 'Personalizza' }));
    expect(await screen.findByRole('heading', { name: 'Personalizza' })).toHaveFocus();
    expect(screen.getByText('Bookeeper 2.2.0')).toBeInTheDocument();
    expect(container.querySelector('section')).toHaveAttribute('data-height', 'tall');
    expect(screen.getByText('Bookeeper è sempre nel menu Start: serve alle notifiche di Windows.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('switch', { name: 'Icona sul desktop' }));
    await userEvent.click(screen.getByRole('switch', { name: "Apri Bookeeper all'accesso a Windows" }));
    await userEvent.click(screen.getByRole('button', { name: 'Cambia…' }));
    await waitFor(() => expect(screen.getByLabelText('Cartella')).toHaveValue('C:\\Programmi Miei\\Bookeeper'));

    await userEvent.click(screen.getByRole('button', { name: 'Meno scelte' }));
    expect(await screen.findByRole('heading', { name: 'Installa Bookeeper' })).toHaveFocus();
    expect(screen.getByText('C:\\Programmi Miei\\Bookeeper')).toBeInTheDocument();
    expect(screen.getByText('Nel menu Start')).toBeInTheDocument();
    expect(screen.getByText(/Si apre all.accesso a Windows/)).toBeInTheDocument();
    expect(container.querySelector('section')).toHaveAttribute('data-height', 'short');
  });

  it('installs with the changed choices', async () => {
    const request = vi.fn();
    const bridge = mockBridge('welcome', { tickMs: 5 });
    bridge.install = (r) => (request(r), Promise.resolve({ ok: false, error: 'io' }));
    renderInstall('welcome', {}, bridge);
    await userEvent.click(screen.getByRole('button', { name: 'Personalizza' }));
    await userEvent.click(screen.getByRole('switch', { name: 'Icona sul desktop' }));
    await userEvent.click(screen.getByRole('switch', { name: "Apri Bookeeper all'accesso a Windows" }));
    await userEvent.click(screen.getByRole('button', { name: 'Cambia…' }));
    await waitFor(() => expect(screen.getByLabelText('Cartella')).toHaveValue('C:\\Programmi Miei\\Bookeeper'));
    await userEvent.click(screen.getByRole('button', { name: 'Installa' }));
    expect(request).toHaveBeenCalledWith({
      dir: 'C:\\Programmi Miei\\Bookeeper',
      desktopIcon: false,
      autostart: true,
      mode: 'install',
    });
  });

  it('tells the space left under the folder', async () => {
    renderInstall('welcome');
    await userEvent.click(screen.getByRole('button', { name: 'Personalizza' }));
    expect(await screen.findByText('Servono 41 MB. Sul disco C: restano 212,0 GB liberi.')).toBeInTheDocument();
  });

  it('shows a folder problem, ties it to the field and turns «Installa» off', async () => {
    const bridge = mockBridge('welcome', { tickMs: 5 });
    bridge.pickDir = () => Promise.resolve('\\\\server\\libri');
    renderInstall('welcome', {}, bridge);
    await userEvent.click(screen.getByRole('button', { name: 'Personalizza' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cambia…' }));
    const problem = await screen.findByText('Scegli una cartella di questo computer.');
    const field = screen.getByLabelText('Cartella');
    expect(field).toHaveAttribute('aria-describedby', problem.id);
    expect(within(document.body).getByRole('button', { name: 'Installa' })).toBeDisabled();
  });
});

describe('quotes', () => {
  it('changes the quote when the work starts', async () => {
    renderInstall('welcome');
    const before = document.querySelector('blockquote')?.textContent;
    await userEvent.click(screen.getByRole('button', { name: 'Installa' }));
    await screen.findByRole('heading', { name: 'Sto installando Bookeeper' });
    const after = document.querySelector('blockquote')?.textContent;
    expect(before).toBeTruthy();
    expect(after).toBeTruthy();
    expect(after).not.toBe(before);
  });
});

describe('folder check pending', () => {
  it('keeps «Installa» off until check_dir has answered, and never installs the raw folder', async () => {
    let answer: (c: DirCheck) => void = () => undefined;
    const bridge = mockBridge('welcome', { tickMs: 5 });
    bridge.checkDir = () => new Promise<DirCheck>((resolve) => (answer = resolve));
    const request = vi.fn();
    const install = bridge.install.bind(bridge);
    bridge.install = (r) => (request(r), install(r));
    renderInstall('welcome', {}, bridge);
    await userEvent.click(screen.getByRole('button', { name: 'Personalizza' }));
    expect(screen.getByRole('button', { name: 'Installa' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Installa' }));
    expect(request).not.toHaveBeenCalled();
    answer({ dir: 'C:\\X\\Bookeeper', problem: null, freeBytes: 1e12, drive: 'C:' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Installa' })).toBeEnabled());
  });
});
