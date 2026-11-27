import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../app/testing';
import type { AppModule } from '../../app/types';
import { firstBook } from '../tour/firstBook';
import { module as tour } from '../tour/routes';
import { resetTourForTest, tourSignal, useTourStore } from '../tour/store';
import { module } from './routes';
import { device, fleetPlatform, type Fleet } from './testkit';

const elsewhere: AppModule = { id: 'books', nav: { labelKey: 'books.title', icon: 'book', to: '/books', group: 'main', order: 10 }, routes: [{ path: '/books', element: <h1>Libri</h1> }] };
const X: Record<string, number> = { 'nav.devices': 10, 'devices.addPhone': 20, 'devices.qr': 30 };
const PHONE = { phone_ready: true, public_url: 'https://libreria.example.org' };

const state = () => useTourStore.getState();
const lampOn = (id: string) => expect((document.querySelector('[data-tour-spotlight] > div') as HTMLElement | null)?.style.transform).toBe(`translate(${X[id]! - 8}px, 92px)`);

function show(fleet: Fleet, route = '/devices') {
  renderApp({ platform: fleetPlatform(fleet), modules: [module, elsewhere, tour], route });
}

const base = (): Fleet => ({ devices: [device(1, { name: 'Portatile', current: true })], server: PHONE });

/** Starts the path and finishes the first two steps. */
function atPhone() {
  act(() => state().start(firstBook));
  act(() => tourSignal('book-created'));
  act(() => tourSignal('book-placed'));
}

beforeEach(() => {
  resetTourForTest();
  localStorage.clear();
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const id = this.getAttribute('data-tour');
    const x = id ? (X[id] ?? 5) : 0;
    const on = id && id !== 'devices.page';
    return { x, y: 100, left: x, top: 100, width: on ? 80 : 0, height: on ? 32 : 0, right: x + 80, bottom: 132, toJSON: () => ({}) } as DOMRect;
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('«Portalo in tasca»', () => {
  it('is a third step only when a phone can be paired', async () => {
    show({ ...base(), server: { phone_ready: false, public_url: null } });
    await screen.findByText('Portatile');
    atPhone();
    await waitFor(() => expect(state().status).toBe('done'));
    expect(firstBook.steps).toHaveLength(2);
  });

  it('lights the way to the QR and ends with a phone arriving', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const fleet = base();
    show(fleet, '/books');
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await screen.findByRole('heading', { name: 'Libri' });
    await user.click(screen.getByRole('link', { name: 'Dispositivi' }));
    await screen.findByRole('button', { name: 'Aggiungi un telefono' });
    await waitFor(() => expect(firstBook.steps).toHaveLength(3));
    atPhone();
    expect(state().status).toBe('running');
    expect(state().step).toBe(2);
    await waitFor(() => lampOn('devices.addPhone'));

    await user.click(screen.getByRole('button', { name: 'Aggiungi un telefono' }));
    await screen.findByText('ABCD 2345');
    // Frames are timed by the faked clock: let a few pass.
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await waitFor(() => lampOn('devices.qr'));
    expect(screen.getByRole('dialog')).toContainElement(screen.getByRole('region', { name: 'Portalo in tasca' }));
    expect(screen.getByText('Inquadralo con la fotocamera del telefono.')).toBeInTheDocument();

    fleet.devices = [device(9, { name: 'Telefono', kind: 'mobile' }), ...fleet.devices];
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    await waitFor(() => expect(state().status).toBe('done'));
    expect(await screen.findByRole('region', { name: 'La tua libreria è pronta' })).toBeInTheDocument();
  });

  it('a new computer is not a phone', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const fleet = base();
    show(fleet);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await screen.findByRole('button', { name: 'Aggiungi un telefono' });
    await waitFor(() => expect(firstBook.steps).toHaveLength(3));
    await user.click(screen.getByRole('button', { name: 'Aggiungi un computer' }));
    await screen.findByText('ABCD 2345');
    atPhone();
    fleet.devices = [device(9, { name: 'Nuovo PC' }), ...fleet.devices];
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(await screen.findByText('Dispositivo aggiunto')).toBeInTheDocument();
    expect(state().status).toBe('running');
  });
});
