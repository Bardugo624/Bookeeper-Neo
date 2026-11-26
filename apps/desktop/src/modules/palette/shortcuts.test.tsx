import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog } from '@bookeeper/ui/overlays';
import { describe, expect, it } from 'vitest';
import type { AppModule } from '../../app/types';
import { PAGES, renderPalette } from './testkit';

const nav = () => screen.findByRole('navigation', { name: 'Navigazione principale' });

describe('go to', () => {
  it('g then s goes to the shelves, g then l to the books', async () => {
    const { router } = renderPalette({}, '/stats');
    await nav();
    await userEvent.keyboard('gs');
    expect(router.state.location.pathname).toBe('/shelves');
    await userEvent.keyboard('gl');
    expect(router.state.location.pathname).toBe('/books');
    await userEvent.keyboard('gi');
    expect(router.state.location.pathname).toBe('/settings');
  });

  it('a lone g, or g and an unknown key, goes nowhere', async () => {
    const { router } = renderPalette({}, '/stats');
    await nav();
    await userEvent.keyboard('gx');
    await userEvent.keyboard('s');
    expect(router.state.location.pathname).toBe('/stats');
  });

  it('does not fire in a text field', async () => {
    const field: AppModule = { id: 'f', routes: [{ path: '/f', element: <input aria-label="campo" /> }], nav: { labelKey: 'f', icon: 'book', to: '/f', group: 'main', order: 99 } };
    const { router } = renderPalette({ modules: [...PAGES, field] }, '/f');
    await nav();
    await userEvent.click(screen.getByLabelText('campo'));
    await userEvent.keyboard('gs?n');
    expect(router.state.location.pathname).toBe('/f');
    expect(screen.getByLabelText('campo')).toHaveValue('gs?n');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not fire while a dialog is open', async () => {
    const dlg: AppModule = {
      id: 'd',
      routes: [{ path: '/d', element: <Dialog open onOpenChange={() => {}} title="Aperto" closeLabel="Chiudi" /> }],
      nav: { labelKey: 'd', icon: 'book', to: '/d', group: 'main', order: 99 },
    };
    const { router } = renderPalette({ modules: [...PAGES, dlg] }, '/d');
    await screen.findByRole('dialog', { name: 'Aperto' });
    await userEvent.keyboard('gs');
    expect(router.state.location.pathname).toBe('/d');
  });
});

describe('other keys', () => {
  it('n opens the new book form for who can write, and not for a guest', async () => {
    const { router, unmount } = renderPalette({ role: 'member' }, '/stats');
    await nav();
    await userEvent.keyboard('n');
    expect(router.state.location.pathname + router.state.location.search).toBe('/books?new=1');
    unmount();
    const guest = renderPalette({ role: 'guest' }, '/stats');
    await nav();
    await userEvent.keyboard('n');
    expect(guest.router.state.location.pathname).toBe('/stats');
  });

  it('? opens the list, with the keys of the platform', async () => {
    renderPalette();
    await nav();
    await userEvent.keyboard('?');
    const dialog = await screen.findByRole('dialog', { name: 'Scorciatoie da tastiera' });
    expect(dialog).toHaveTextContent('Ctrl');
    expect(dialog).toHaveTextContent('Apre la palette dei comandi');
    expect(dialog).toHaveTextContent('Esc');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows Cmd on macOS', async () => {
    const spy = Object.getOwnPropertyDescriptor(Navigator.prototype, 'platform');
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true });
    try {
      renderPalette();
      await nav();
      await userEvent.keyboard('?');
      expect(await screen.findByRole('dialog')).toHaveTextContent('Cmd');
    } finally {
      delete (navigator as unknown as Record<string, unknown>).platform;
      if (spy) Object.defineProperty(Navigator.prototype, 'platform', spy);
    }
  });

  it('Ctrl K again closes the palette', async () => {
    renderPalette();
    await nav();
    await userEvent.keyboard('{Control>}k{/Control}');
    await screen.findByRole('combobox');
    await userEvent.keyboard('{Control>}k{/Control}');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
