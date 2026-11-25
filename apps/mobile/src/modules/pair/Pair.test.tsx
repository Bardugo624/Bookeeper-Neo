import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { LOCALES, t } from '@bookeeper/i18n';
import { renderMobile } from '../../app/testing';
import type { MobileModule } from '../../app/types';
import { fakePlatform, type FakePlatform, type Handler } from '../../platform/testing';
import { SESSION_KEY } from '../../session';
import { ME, ok, pair } from '../../session/fixtures';
import { normalizeCode } from './normalize';
import { module as pairModule } from './routes';

const REDEEM = '/api/v1/pairing/redeem';
const AUTH = {
  library: { id: 'l9', name: 'Biblioteca Verdi' },
  user: ME.user,
  session: { access_token: 'new-access', refresh_token: 'new-refresh', device_id: 'd9', expires_in: 900 },
};
const search: MobileModule = {
  id: 'search',
  routes: [{ path: '/search', element: <p>Cerca qui</p> }],
  tab: { labelKey: 'test.search', icon: 'search', to: '/search', order: 10 },
};
const apiError = (status: number, code: string) => ({ status, body: { error_code: code, message: 'x' } });

function platformWith(redeem: Handler = () => ok(AUTH)): FakePlatform {
  return fakePlatform({ handler: (c) => (c.path === REDEEM ? redeem(c) : c.path === '/api/v1/me' ? ok(ME) : apiError(404, 'not_found')) });
}
const redeems = (p: FakePlatform) => p.fake.calls.filter((c) => c.path === REDEEM);
const open = (p: FakePlatform, route: string) => renderMobile({ platform: p, modules: [pairModule, search], route });

describe('from a QR link', () => {
  it('makes no request until "Collega" is tapped, then pairs and drops the code from the address', async () => {
    const p = platformWith();
    const { router } = open(p, '/pair?code=ABCD2345');
    expect(await screen.findByRole('heading', { name: 'Collega questo telefono' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nome del dispositivo')).toHaveValue('iPhone · Safari');
    expect(redeems(p)).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Collega' }));
    expect(await screen.findByText('Cerca qui')).toBeInTheDocument();
    expect(redeems(p)).toHaveLength(1);
    expect(redeems(p)[0]!.body).toEqual({ code: 'ABCD2345', device_name: 'iPhone · Safari', device_kind: 'mobile' });
    expect(router.state.location.pathname).toBe('/search');
    expect(router.state.location.search).toBe('');
    expect(JSON.parse(p.storage.get(SESSION_KEY)!)).toMatchObject({ access_token: 'new-access', device_id: 'd9' });
  });

  it('sends the edited device name', async () => {
    const p = platformWith();
    open(p, '/pair?code=ABCD2345');
    const field = await screen.findByLabelText('Nome del dispositivo');
    await userEvent.clear(field);
    await userEvent.type(field, 'Telefono di Anna');
    await userEvent.click(screen.getByRole('button', { name: 'Collega' }));
    await screen.findByText('Cerca qui');
    expect(redeems(p)[0]!.body).toMatchObject({ device_name: 'Telefono di Anna' });
  });

  it('sends only one request on a double tap and shows the loading button', async () => {
    let release: (v: ReturnType<typeof ok>) => void = () => undefined;
    const p = platformWith(() => new Promise((r) => (release = r)) as never);
    open(p, '/pair?code=ABCD2345');
    const button = await screen.findByRole('button', { name: 'Collega' });
    await userEvent.dblClick(button);
    expect(redeems(p)).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Collegamento in corso/ })).toBeDisabled();
    await act(async () => release(ok(AUTH)));
    expect(await screen.findByText('Cerca qui')).toBeInTheDocument();
    expect(redeems(p)).toHaveLength(1);
  });

  it('keeps the page and shows the expired-code message', async () => {
    const p = platformWith(() => apiError(401, 'pairing_code_invalid'));
    const { router } = open(p, '/pair?code=ABCD2345');
    await userEvent.click(await screen.findByRole('button', { name: 'Collega' }));
    expect(await screen.findByText(/scaduto.*codice nuovo dal computer/)).toBeInTheDocument();
    expect(router.state.location.search).toBe('?code=ABCD2345');
    // The code is still there: a second tap tries again.
    await userEvent.click(screen.getByRole('button', { name: 'Collega' }));
    await waitFor(() => expect(redeems(p)).toHaveLength(2));
  });
});

describe('without a code', () => {
  it('explains the three steps and offers "Ho un codice"', async () => {
    const p = platformWith();
    const { router } = open(p, '/pair');
    expect(await screen.findByRole('list', { name: 'Come ottenere il QR' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    await userEvent.click(screen.getByRole('button', { name: 'Ho un codice' }));
    expect(router.state.location.pathname).toBe('/pair/code');
    expect(await screen.findByLabelText('Codice di abbinamento')).toBeInTheDocument();
    expect(redeems(p)).toHaveLength(0);
  });
});

describe('typed code', () => {
  const type = async (code: string) => {
    await userEvent.type(await screen.findByLabelText('Codice di abbinamento'), code);
  };

  it('upper-cases and tolerates spaces and dashes', async () => {
    const p = platformWith();
    open(p, '/pair/code');
    await type(' abcd - ef12 ');
    expect(screen.getByLabelText('Codice di abbinamento')).toHaveValue(' ABCD - EF12 ');
    await userEvent.click(screen.getByRole('button', { name: 'Collega' }));
    await screen.findByText('Cerca qui');
    expect(redeems(p)[0]!.body).toEqual({ code: 'ABCDEF12', device_name: 'iPhone · Safari', device_kind: 'mobile' });
  });

  it('normalizes lower case, spaces and dashes', () => {
    expect(normalizeCode(' ab-cd ef\t12 ')).toBe('ABCDEF12');
  });

  it('refuses an empty field without a request', async () => {
    const p = platformWith();
    open(p, '/pair/code');
    await userEvent.click(await screen.findByRole('button', { name: 'Collega' }));
    expect(await screen.findByText('Scrivi il codice mostrato sul computer.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Codice di abbinamento'), ' - ');
    await userEvent.click(screen.getByRole('button', { name: 'Collega' }));
    expect(screen.getByText('Scrivi il codice mostrato sul computer.')).toBeInTheDocument();
    expect(redeems(p)).toHaveLength(0);
  });

  it.each([
    ['expired', () => apiError(401, 'pairing_code_invalid'), /scaduto/],
    ['rate limited', () => ({ status: 429, body: { error_code: 'rate_limited', message: 'x' }, retryAfter: 42 }), /Riprova tra 42 secondi/],
    ['offline', () => ({ status: 0, body: { error_code: 'network', message: 'x' } }), /Non riesco a raggiungere Bookeeper/],
  ])('shows a distinct message when %s and keeps the code', async (_n, answer, text) => {
    const p = platformWith(answer as Handler);
    open(p, '/pair/code');
    await type('abcd2345');
    await userEvent.click(screen.getByRole('button', { name: 'Collega' }));
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.getByLabelText('Codice di abbinamento')).toHaveValue('ABCD2345');
    expect(screen.getByRole('button', { name: 'Collega' })).toBeEnabled();
  });

  it('speaks English', async () => {
    const p = platformWith();
    renderMobile({ platform: p, modules: [pairModule, search], route: '/pair/code', locale: 'en' });
    expect(await screen.findByRole('heading', { name: 'Enter the code' })).toBeInTheDocument();
  });
});

describe('phone already paired (real app, session gate)', () => {
  const link = '/pair?code=ABCD2345';

  it('asks first and keeps the current library on "Tieni la libreria attuale"', async () => {
    const p = platformWith();
    pair(p.storage);
    const { router } = open(p, link);
    expect(await screen.findByText('Questo telefono è già collegato a Casa Rossi. Vuoi collegarlo di nuovo?')).toBeInTheDocument();
    expect(redeems(p)).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Tieni la libreria attuale' }));
    expect(await screen.findByText('Cerca qui')).toBeInTheDocument();
    expect(router.state.location.search).toBe('');
    expect(redeems(p)).toHaveLength(0);
  });

  it('pairs again on "Collega di nuovo" with the new session', async () => {
    const p = platformWith();
    pair(p.storage);
    const { router } = open(p, link);
    await userEvent.click(await screen.findByRole('button', { name: 'Collega di nuovo' }));
    expect(redeems(p)).toHaveLength(0);
    await userEvent.click(await screen.findByRole('button', { name: 'Collega' }));
    expect(await screen.findByText('Cerca qui')).toBeInTheDocument();
    expect(redeems(p)).toHaveLength(1);
    expect(router.state.location.search).toBe('');
    expect(JSON.parse(p.storage.get(SESSION_KEY)!).access_token).toBe('new-access');
  });
});

describe('texts', () => {
  const keys = [
    'link.title', 'link.text', 'link.action', 'link.busy', 'name.label', 'name.hint',
    'intro.title', 'intro.text', 'intro.stepsLabel', 'intro.step1', 'intro.step2', 'intro.step3', 'intro.haveCode',
    'code.title', 'code.text', 'code.label', 'code.hint', 'code.placeholder', 'code.action', 'code.busy', 'code.back',
    'already.title', 'already.text', 'already.textUnknown', 'already.keep', 'already.again',
    'errors.codeEmpty', 'errors.nameEmpty', 'errors.invalid', 'errors.network',
  ];
  it.each(LOCALES.flatMap((l) => keys.map((k) => [l, k] as const)))('%s has mpair.%s', (locale, key) => {
    expect(t(locale, `mpair.${key}`)).not.toBe(`mpair.${key}`);
  });
});
