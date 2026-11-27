import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockBridge, mockInfo, useBusy, type MockBridge, type OpResult, type Scenario } from '../bridge';
import { TitleBar } from '../shell';
import { renderSetup } from '../shell/testing';
import { UninstallFlow } from './index';

function setup(scenario: Scenario = 'uninstall', results: OpResult[] = []) {
  const bridge = mockBridge(scenario, { tickMs: 1 });
  const base = bridge.uninstall;
  const queue = [...results];
  const wrapped: MockBridge = {
    ...bridge,
    uninstall: (deleteData) => {
      const next = queue.shift();
      if (!next) return base(deleteData);
      bridge.calls.push(`uninstall:${deleteData}`);
      return Promise.resolve(next);
    },
  };
  renderSetup(<UninstallFlow info={mockInfo(scenario)} />, { bridge: wrapped });
  return { bridge: wrapped, user: userEvent.setup() };
}

const keep = () => screen.getByRole('radio', { name: /Tieni la libreria/ });
const wipe = () => screen.getByRole('radio', { name: /Cancella tutto/ });

describe('UninstallFlow: choice', () => {
  it('has the title, the meta and «Tieni la libreria» already chosen', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Disinstalla Bookeeper' })).toHaveFocus();
    expect(screen.getByText(/Versione 2\.2\.0 · in C:\\Users\\Giulia/)).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Disinstalla Bookeeper' })).toBeInTheDocument();
    expect(keep()).toBeChecked();
    expect(wipe()).not.toBeChecked();
  });

  it('uses the medium panel, so the quote stays centred above the choice', () => {
    setup();
    const stage = screen.getByRole('heading', { name: 'Disinstalla Bookeeper' }).closest('[data-panel]');
    expect(stage).toHaveAttribute('data-panel', 'medium');
    expect(stage?.querySelector('section')).toHaveAttribute('data-height', 'medium');
  });

  it('uninstalls keeping the library, with no confirmation', async () => {
    const { bridge, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Disinstalla' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(bridge.calls).toContain('uninstall:false'));
  });

  it('moves the choice with the arrow keys', async () => {
    const { user } = setup();
    keep().focus();
    await user.keyboard('{ArrowRight}');
    expect(wipe()).toBeChecked();
    expect(wipe()).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(keep()).toBeChecked();
    await user.keyboard('{ArrowDown}');
    expect(wipe()).toBeChecked();
  });

  it('«Annulla» quits with 1', async () => {
    const { bridge, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Annulla' }));
    expect(bridge.calls).toContain('quit:1');
  });

  it('names the weight, and the e-books when there are some', () => {
    setup('uninstall-ebooks');
    expect(screen.getByText('Libri, copertine, e-book e backup restano su questo computer. Se reinstalli, li ritrovi.')).toBeInTheDocument();
    expect(screen.getByText('Toglie anche la libreria di questo computer: 1,5 GB, con copertine, e-book e backup.')).toBeInTheDocument();
  });

  it('talks about saved data when there is no library', () => {
    setup('uninstall-remote');
    expect(screen.getByText(/I collegamenti alle librerie su server restano/)).toBeInTheDocument();
    expect(screen.getByText('Toglie anche i dati salvati su questo computer: 2 MB, con i collegamenti alle librerie su server.')).toBeInTheDocument();
  });
});

describe('UninstallFlow: confirmation', () => {
  async function openConfirm(scenario: Scenario = 'uninstall') {
    const ctx = setup(scenario);
    await ctx.user.click(wipe());
    await ctx.user.click(screen.getByRole('button', { name: 'Disinstalla' }));
    return { ...ctx, dialog: await screen.findByRole('dialog') };
  }

  it('opens with «Cancella tutto», focus not on the destructive button', async () => {
    const { bridge, dialog } = await openConfirm();
    expect(within(dialog).getByText('Cancellare tutta la libreria?')).toBeInTheDocument();
    expect(within(dialog).getByText('Spariscono da questo computer i libri, le copertine e i backup automatici: 212 MB. Non si può annullare.')).toBeInTheDocument();
    expect(within(dialog).getByText('Le librerie su un server restano dove sono.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Chiudi' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancella tutto' })).not.toHaveFocus();
    expect(bridge.calls).not.toContain('uninstall:true');
  });

  it('«Annulla» closes it without uninstalling', async () => {
    const { bridge, user, dialog } = await openConfirm();
    await user.click(within(dialog).getByRole('button', { name: 'Annulla' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(bridge.calls.some((c) => c.startsWith('uninstall'))).toBe(false);
  });

  it('Esc closes it', async () => {
    const { bridge, user } = await openConfirm();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(bridge.calls.some((c) => c.startsWith('uninstall'))).toBe(false);
  });

  it('«Cancella tutto» uninstalls deleting the data', async () => {
    const { bridge, user, dialog } = await openConfirm();
    await user.click(within(dialog).getByRole('button', { name: 'Cancella tutto' }));
    await waitFor(() => expect(bridge.calls).toContain('uninstall:true'));
  });

  it('uses the e-book and remote variants', async () => {
    const first = await openConfirm('uninstall-ebooks');
    expect(within(first.dialog).getByText(/le copertine, gli e-book e i backup automatici: 1,5 GB/)).toBeInTheDocument();
  });

  it('uses the remote variant of title and text', async () => {
    const { dialog } = await openConfirm('uninstall-remote');
    expect(within(dialog).getByText('Cancellare i dati di Bookeeper?')).toBeInTheDocument();
    expect(within(dialog).getByText(/i collegamenti alle librerie e i dati salvati: 2 MB/)).toBeInTheDocument();
  });
});

describe('UninstallFlow: running and end', () => {
  it('shows the progress, then «kept» and closes with 0', async () => {
    // The uninstall stays open until the test ends it: the progress is not a race against the mock.
    const bridge = mockBridge('uninstall', { tickMs: 1 });
    let finish: (result: OpResult) => void = () => {};
    const held: MockBridge = { ...bridge, uninstall: () => new Promise<OpResult>((resolve) => (finish = resolve)) };
    renderSetup(<UninstallFlow info={mockInfo('uninstall')} />, { bridge: held });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Disinstalla' }));
    expect(await screen.findByRole('progressbar', { name: 'Sto disinstallando Bookeeper' })).toBeInTheDocument();
    act(() => {
      bridge.emitProgress({ step: 'finish', fraction: 1, done: true });
      finish({ ok: true });
    });
    const title = await screen.findByRole('heading', { name: 'Bookeeper è stato disinstallato' });
    expect(title).toHaveFocus();
    expect(screen.getByText(/La tua libreria è ancora su questo computer/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Chiudi' }));
    expect(bridge.calls).toContain('quit:0');
  });

  it('names the first uninstall step before any progress arrives', async () => {
    const bridge = mockBridge('uninstall', { tickMs: 1 });
    const silent: MockBridge = { ...bridge, uninstall: () => new Promise(() => {}) };
    renderSetup(<UninstallFlow info={mockInfo('uninstall')} />, { bridge: silent });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Disinstalla' }));
    await screen.findByRole('progressbar', { name: 'Sto disinstallando Bookeeper' });
    expect(screen.getByRole('status')).toHaveTextContent("Tolgo l’app");
    expect(screen.queryByText("Preparo l’installazione")).not.toBeInTheDocument();
  });

  it('shows «deleted» after «Cancella tutto»', async () => {
    const { user } = setup();
    await user.click(wipe());
    await user.click(screen.getByRole('button', { name: 'Disinstalla' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancella tutto' }));
    expect(await screen.findByText('Su questo computer non restano i tuoi dati di Bookeeper.')).toBeInTheDocument();
  });

  it('asks to close the app on app_running, and retries', async () => {
    const { bridge, user } = setup('uninstall', [{ ok: false, error: 'app_running' }]);
    await user.click(screen.getByRole('button', { name: 'Disinstalla' }));
    const title = await screen.findByRole('heading', { name: 'Chiudi Bookeeper per continuare' });
    expect(title).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Riprova' }));
    await screen.findByRole('heading', { name: 'Bookeeper è stato disinstallato' });
    expect(bridge.calls.filter((c) => c === 'uninstall:false')).toHaveLength(2);
  });

  it('shows the error panel with copy and retry', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const { user } = setup('uninstall', [{ ok: false, error: 'nsis_failed', code: 5 }]);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await user.click(screen.getByRole('button', { name: 'Disinstalla' }));
    expect(await screen.findByRole('heading', { name: 'La disinstallazione si è fermata' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Copia i dettagli' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('nsis exited')));
    expect(await screen.findByRole('button', { name: 'Dettagli copiati' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Riprova' }));
    await screen.findByRole('heading', { name: 'Bookeeper è stato disinstallato' });
  });
});

describe('UninstallFlow: focus with the title bar', () => {
  it('lands on the progress title after «Cancella tutto», not on the title bar', async () => {
    const bridge = mockBridge('uninstall', { tickMs: 1 });
    const hanging: MockBridge = { ...bridge, uninstall: () => new Promise(() => {}) };
    function Shell() {
      return (
        <>
          <TitleBar busy={useBusy()} />
          <UninstallFlow info={mockInfo('uninstall')} />
        </>
      );
    }
    renderSetup(<Shell />, { bridge: hanging });
    const user = userEvent.setup();
    await user.click(wipe());
    await user.click(screen.getByRole('button', { name: 'Disinstalla' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancella tutto' }));
    const title = await screen.findByRole('heading', { name: 'Sto disinstallando Bookeeper' });
    await new Promise((r) => setTimeout(r, 30));
    expect(title).toHaveFocus();
  });
});
