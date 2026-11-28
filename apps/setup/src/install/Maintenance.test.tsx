import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderInstall } from './testing';

const names = () => screen.getAllByRole('button').map((b) => b.textContent);
const commands = names;

describe('an older installation', () => {
  it('offers «Disinstalla» and «Aggiorna», and updates in the installed folder', async () => {
    const { bridge, onUninstall } = renderInstall('older');
    expect(screen.getByRole('heading', { name: 'Aggiorna Bookeeper' })).toHaveFocus();
    expect(screen.getByText(/Su questo computer c’è la 2\.1\.0\. La 2\.2\.0 lascia/)).toBeInTheDocument();
    expect(commands()).toEqual(['Disinstalla', 'Aggiorna']);
    await userEvent.click(screen.getByRole('button', { name: 'Disinstalla' }));
    expect(onUninstall).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Aggiorna' }));
    expect(await screen.findByRole('heading', { name: 'Sto aggiornando Bookeeper' })).toBeInTheDocument();
    expect(bridge.calls).toContain('install:update');
    expect(await screen.findByRole('heading', { name: 'Bookeeper è aggiornato' })).toBeInTheDocument();
    expect(screen.getByText('Lo trovi nel menu Start.')).toBeInTheDocument();
  });
});

describe('the same version', () => {
  it('offers «Disinstalla», «Ripara» and «Apri Bookeeper»', async () => {
    const { bridge } = renderInstall('same');
    expect(screen.getByRole('heading', { name: 'Bookeeper 2.2.0 è già installato' })).toBeInTheDocument();
    expect(commands()).toEqual(['Disinstalla', 'Ripara', 'Apri Bookeeper']);
    await userEvent.click(screen.getByRole('button', { name: 'Apri Bookeeper' }));
    expect(bridge.calls).toContain('launchApp');
    await userEvent.click(screen.getByRole('button', { name: 'Ripara' }));
    expect(await screen.findByRole('heading', { name: 'Bookeeper è riparato' })).toBeInTheDocument();
    expect(bridge.calls).toContain('install:repair');
  });
});

describe('a newer version', () => {
  it('only offers «Disinstalla» and «Chiudi»', async () => {
    const { bridge, onUninstall } = renderInstall('newer');
    expect(screen.getByRole('heading', { name: "C’è già una versione più recente" })).toBeInTheDocument();
    expect(commands()).toEqual(['Disinstalla', 'Chiudi']);
    await userEvent.click(screen.getByRole('button', { name: 'Disinstalla' }));
    expect(onUninstall).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Chiudi' }));
    expect(bridge.calls).toContain('quit:0');
    expect(bridge.calls.some((c) => c.startsWith('install'))).toBe(false);
  });
});

describe('a 0.x or 1.x version', () => {
  it('only offers «Chiudi»', () => {
    renderInstall('legacy');
    expect(screen.getByRole('heading', { name: 'C’è una versione molto vecchia' })).toBeInTheDocument();
    expect(screen.getByText(/Disinstallala da Impostazioni/)).toBeInTheDocument();
    expect(commands()).toEqual(['Chiudi']);
  });
});
