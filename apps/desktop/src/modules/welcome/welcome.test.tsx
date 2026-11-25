import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AuthOut } from '@bookeeper/api';
import { fakeConnection, fakePlatform, type FakePlatform } from '../../platform/testing';
import type { ProbeOut } from '../../platform';
import { renderApp } from '../../app/testing';
import { ME } from '../../session/fixtures';
import { useSession } from '../../session';
import { module as welcome } from './routes';

type Reply = { status: number; body: unknown; retryAfter?: number };
type Routes = Record<string, Reply | ((body: unknown) => Reply | Promise<Reply>)>;

const AUTH: AuthOut = {
  library: { id: 'l1', name: 'Casa Rossi' },
  user: { id: 'u1', display_name: 'Anna', email: 'anna@example.org', role: 'owner' },
  session: { access_token: 'new-access', refresh_token: 'new-refresh', device_id: 'd9', expires_in: 900 },
};
const fail = (status: number, code: string, retryAfter?: number): Reply => ({
  status,
  body: { error_code: code, message: 'x' },
  ...(retryAfter === undefined ? {} : { retryAfter }),
});
const SETUP_OPEN = { needs_setup: true, code_required: false };
const PHRASE = 'alba bosco campo dado erba fiore';

function probeOut(over: Partial<ProbeOut> = {}): ProbeOut {
  return {
    reachable: true,
    trusted: true,
    fingerprint: null,
    phrase: null,
    server: { phone_ready: false, public_url: null, tls: 'off', version: '2.0.0' },
    setup: { needs_setup: false, code_required: false },
    error: null,
    ...over,
  };
}

function platformWith(routes: Routes = {}, opts: Parameters<typeof fakePlatform>[0] = {}): FakePlatform {
  const table: Routes = { 'GET /api/v1/setup': { status: 200, body: SETUP_OPEN }, 'GET /api/v1/me': { status: 200, body: ME }, ...routes };
  return fakePlatform({
    ...opts,
    handler: async (r) => {
      const hit = table[`${r.method} ${r.path}`];
      if (!hit) return { status: 404, body: { error_code: 'not_found', message: 'x' } };
      return typeof hit === 'function' ? hit(r.body) : hit;
    },
  });
}

const posts = (p: FakePlatform, path: string) => p.calls.filter((c) => c.method === 'POST' && c.path === `/api/v1${path}`);
const credentialPosts = (p: FakePlatform) => p.calls.filter((c) => c.method === 'POST');
const ready = () => waitFor(() => expect(useSession.getState().status).toBe('ready'));

function show(platform: FakePlatform) {
  renderApp({ platform, modules: [welcome], route: '/welcome' });
}
// The toast provider keeps an empty `alert` live region mounted; only alerts with text count here.
const alerts = () => screen.queryAllByRole('alert').filter((a) => a.textContent);
const findAlert = () => waitFor(() => expect(alerts()).toHaveLength(1)).then(() => alerts()[0]!);
const user = () => userEvent.setup();
const openCard = async (u: ReturnType<typeof user>, name: RegExp) => u.click(await screen.findByRole('button', { name }));
const type = async (u: ReturnType<typeof user>, label: string, text: string) => u.type(await screen.findByRole('textbox', { name: label }), text);

beforeEach(() => localStorage.clear());

describe('Crea qui', () => {
  it('asks for both names, focuses the first wrong field, and sends nothing', async () => {
    const p = platformWith();
    show(p);
    const u = user();
    await u.click(await screen.findByRole('button', { name: 'Crea la libreria' }));
    expect(alerts()).toHaveLength(2);
    expect(screen.getByRole('textbox', { name: 'Nome della libreria' })).toHaveFocus();
    expect(screen.getByRole('textbox', { name: 'Nome della libreria' })).toBeInvalid();
    expect(credentialPosts(p)).toHaveLength(0);
  });

  it('creates the library on the local connection without email, password or code', async () => {
    const p = platformWith({ 'POST /api/v1/setup': { status: 201, body: AUTH } });
    show(p);
    const u = user();
    await type(u, 'Nome della libreria', 'Casa Rossi');
    await type(u, 'Il tuo nome', 'Anna');
    await u.click(screen.getByRole('button', { name: 'Crea la libreria' }));
    await ready();
    const [call] = posts(p, '/setup');
    expect(call?.body).toEqual({ library_name: 'Casa Rossi', display_name: 'Anna', device_kind: 'desktop', device_name: 'Test device' });
    expect(Object.keys(call?.body as object)).not.toEqual(expect.arrayContaining(['setup_code']));
    const saved = p.state.items.find((c) => c.id === p.state.active);
    expect(saved).toMatchObject({ kind: 'local', access_token: 'new-access', refresh_token: 'new-refresh' });
    expect(call?.connectionId).toBe(saved?.id);
  });

  it('keeps the connection when creation starts while the setup check is pending', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const remote = fakeConnection({ id: 'rem', kind: 'remote', url: 'http://x', library_name: null, user_name: null, access_token: null, refresh_token: null });
    const p = platformWith(
      { 'GET /api/v1/setup': async () => (await gate, { status: 200, body: SETUP_OPEN }), 'POST /api/v1/setup': { status: 201, body: AUTH } },
      { connections: { active: 'rem', items: [remote] } },
    );
    show(p);
    const u = user();
    await u.click(await screen.findByRole('button', { name: "Usa un'altra libreria" }));
    expect(await screen.findByRole('button', { name: /Crea la libreria/ })).toHaveAttribute('aria-busy', 'true');
    await type(u, 'Nome della libreria', 'Casa Rossi');
    await type(u, 'Il tuo nome', 'Anna');
    // The button is disabled while checking, so submit the form directly.
    fireEvent.submit(screen.getByRole('textbox', { name: 'Il tuo nome' }).closest('form')!);
    await new Promise((r) => setTimeout(r, 100));
    // The creation waits for the check to settle before sending anything.
    expect(posts(p, '/setup')).toHaveLength(0);
    release();
    await ready();
    await waitFor(() => expect(p.state.items.find((c) => c.kind === 'local')).toMatchObject({ access_token: 'new-access' }));
    expect(p.state.active).toBe(p.state.items.find((c) => c.kind === 'local')?.id);
    expect(useSession.getState().connection?.kind).toBe('local');
  });

  it('does not remove a connection that was saved with a token while the check was answering', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const remote = fakeConnection({ id: 'rem', kind: 'remote', url: 'http://x', library_name: null, user_name: null, access_token: null, refresh_token: null });
    const p = platformWith(
      { 'GET /api/v1/setup': async () => (await gate, { status: 200, body: SETUP_OPEN }) },
      { connections: { active: 'rem', items: [remote] } },
    );
    show(p);
    await user().click(await screen.findByRole('button', { name: "Usa un'altra libreria" }));
    await waitFor(() => expect(p.state.items.some((c) => c.kind === 'local')).toBe(true));
    // What signIn does: save a token on the connection and make it the active one.
    const local = p.state.items.find((c) => c.kind === 'local')!;
    await p.connections.upsert({ ...local, access_token: 'tok', refresh_token: 'ref' });
    await p.connections.activate(local.id);
    release();
    await new Promise((r) => setTimeout(r, 100));
    expect(p.state.items.find((c) => c.id === local.id)).toMatchObject({ access_token: 'tok' });
  });

  it('sends only one request on a double click', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const p = platformWith({ 'POST /api/v1/setup': async () => (await gate, { status: 201, body: AUTH }) });
    show(p);
    const u = user();
    await type(u, 'Nome della libreria', 'Casa');
    await type(u, 'Il tuo nome', 'Anna');
    await u.dblClick(screen.getByRole('button', { name: 'Crea la libreria' }));
    release();
    await ready();
    expect(posts(p, '/setup')).toHaveLength(1);
  });

  it('offers to open a library that already exists, with no fields', async () => {
    const local = fakeConnection({ id: 'loc', kind: 'local', access_token: null, refresh_token: 'r-old' });
    const p = platformWith(
      {
        'GET /api/v1/setup': { status: 200, body: { needs_setup: false, code_required: false } },
        'POST /api/v1/auth/refresh': { status: 200, body: { session: AUTH.session } },
      },
      { connections: { active: null, items: [local] } },
    );
    show(p);
    const u = user();
    expect(await screen.findByRole('button', { name: /Apri la libreria di questo computer/ })).toBeInTheDocument();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    await u.click(screen.getByRole('button', { name: 'Apri la libreria' }));
    await ready();
    expect(p.state.active).toBe('loc');
  });
});

describe('cards', () => {
  it('keeps one card open at a time and moves between them with the arrow keys', async () => {
    show(platformWith());
    const u = user();
    const headers = await screen.findAllByRole('button', { name: /Crea qui|Unisciti|Crea su un server/ });
    expect(headers.map((h) => h.getAttribute('aria-expanded'))).toEqual(['true', 'false', 'false']);
    headers[0]?.focus();
    await u.keyboard('{ArrowDown}');
    expect(headers[1]).toHaveFocus();
    await u.keyboard('{Enter}');
    expect(headers.map((h) => h.getAttribute('aria-expanded'))).toEqual(['false', 'true', 'false']);
    await u.keyboard('{ArrowUp}{ArrowUp}');
    expect(headers[2]).toHaveFocus();
  });

  it('lists servers found on the network and fills the address from the chosen one', async () => {
    const p = platformWith();
    p.setFound([{ instance: 'Casa Rossi', host: 'casa.local', addrs: [], port: 8443, version: '2', tls: 'selfsigned', url: 'https://casa.local:8443' }]);
    show(p);
    const u = user();
    expect(await screen.findByText('1 trovata in rete')).toBeInTheDocument();
    await openCard(u, /Unisciti/);
    const list = screen.getByRole('list', { name: 'Librerie trovate in rete' });
    expect(within(list).getByText('https://casa.local:8443')).toBeInTheDocument();
    await u.click(within(list).getByRole('button', { name: /Casa Rossi/ }));
    expect(screen.getByRole('textbox', { name: 'Indirizzo del server' })).toHaveValue('https://casa.local:8443');
  });

  it('uses http for a server announced without TLS and without a url', async () => {
    const p = platformWith();
    p.setFound([{ instance: 'Studio', host: 'studio.local', addrs: [], port: 8080, version: '2', tls: 'off', url: null }]);
    show(p);
    const u = user();
    await screen.findByText('1 trovata in rete');
    await openCard(u, /Unisciti/);
    await u.click(screen.getByRole('button', { name: /Studio/ }));
    expect(screen.getByRole('textbox', { name: 'Indirizzo del server' })).toHaveValue('http://studio.local:8080');
  });
});

describe('Unisciti', () => {
  const joinButton = () => screen.getAllByRole('button', { name: 'Unisciti' }).find((b) => b.getAttribute('type') === 'submit')!;

  it('redeems a pairing code after checking the server', async () => {
    const p = platformWith({ 'POST /api/v1/pairing/redeem': { status: 200, body: AUTH } });
    p.setProbe(probeOut());
    show(p);
    const u = user();
    await openCard(u, /Unisciti/);
    await type(u, 'Indirizzo del server', 'https://casa.example/');
    await type(u, 'Codice di abbinamento', '123456');
    await u.click(joinButton());
    await ready();
    expect(posts(p, '/pairing/redeem')[0]?.body).toEqual({ code: '123456', device_kind: 'desktop', device_name: 'Test device' });
    expect(p.state.items.find((c) => c.id === p.state.active)).toMatchObject({ kind: 'remote', url: 'https://casa.example', fingerprint: null });
  });

  it('shows a wrong code next to the field and leaves nothing saved', async () => {
    const p = platformWith({ 'POST /api/v1/pairing/redeem': fail(401, 'pairing_code_invalid') });
    p.setProbe(probeOut());
    show(p);
    const u = user();
    await openCard(u, /Unisciti/);
    await type(u, 'Indirizzo del server', 'https://casa.example');
    await type(u, 'Codice di abbinamento', '000000');
    await u.click(joinButton());
    const alert = await findAlert();
    expect(alert).toHaveTextContent('Il codice non è corretto oppure è scaduto');
    const field = screen.getByRole('textbox', { name: 'Codice di abbinamento' });
    expect(field).toHaveAttribute('aria-describedby', expect.stringContaining(alert.id));
    expect(field).toHaveValue('000000');
    expect(p.state.items).toHaveLength(0);
  });

  it('says how long to wait when the server asks for it', async () => {
    const p = platformWith({ 'POST /api/v1/pairing/redeem': fail(429, 'rate_limited', 30) });
    p.setProbe(probeOut());
    show(p);
    const u = user();
    await openCard(u, /Unisciti/);
    await type(u, 'Indirizzo del server', 'https://casa.example');
    await type(u, 'Codice di abbinamento', '000000');
    await u.click(joinButton());
    expect(await findAlert()).toHaveTextContent('30');
  });

  it('signs in directly when the account has one library', async () => {
    const p = platformWith({
      'POST /api/v1/auth/libraries': { status: 200, body: { libraries: [AUTH.library] } },
      'POST /api/v1/auth/login': { status: 200, body: AUTH },
    });
    p.setProbe(probeOut());
    show(p);
    const u = user();
    await openCard(u, /Unisciti/);
    await u.click(screen.getByRole('tab', { name: 'Email e password' }));
    await type(u, 'Indirizzo del server', 'https://casa.example');
    await type(u, 'Email', 'anna@example.org');
    await u.type(screen.getByLabelText('Password'), 'password-lunga');
    await u.click(joinButton());
    await ready();
    expect(posts(p, '/auth/login')[0]?.body).toMatchObject({ email: 'anna@example.org', password: 'password-lunga', device_kind: 'desktop' });
  });

  it('lets the user choose when the account has several libraries', async () => {
    const p = platformWith({
      'POST /api/v1/auth/libraries': { status: 200, body: { libraries: [{ id: 'l1', name: 'Casa' }, { id: 'l2', name: 'Studio' }] } },
      'POST /api/v1/auth/login': { status: 200, body: AUTH },
    });
    p.setProbe(probeOut());
    show(p);
    const u = user();
    await openCard(u, /Unisciti/);
    await u.click(screen.getByRole('tab', { name: 'Email e password' }));
    await type(u, 'Indirizzo del server', 'https://casa.example');
    await type(u, 'Email', 'anna@example.org');
    await u.type(screen.getByLabelText('Password'), 'password-lunga');
    await u.click(joinButton());
    expect(posts(p, '/auth/login')).toHaveLength(0);
    await u.click(await screen.findByRole('button', { name: 'Entra in Studio' }));
    await ready();
    expect(posts(p, '/auth/login')[0]?.body).toMatchObject({ library_id: 'l2' });
  });

  it('points to "Crea su un server" when the server has no library yet', async () => {
    const p = platformWith();
    p.setProbe(probeOut({ setup: SETUP_OPEN }));
    show(p);
    const u = user();
    await openCard(u, /Unisciti/);
    await type(u, 'Indirizzo del server', 'https://casa.example');
    await type(u, 'Codice di abbinamento', '123456');
    await u.click(joinButton());
    expect(await findAlert()).toHaveTextContent('non ha ancora una libreria');
    await u.click(screen.getByRole('button', { name: /Vai a «Crea su un server»/ }));
    expect(screen.getByRole('button', { name: /Crea su un server/ })).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('certificato non fidato', () => {
  const untrusted = () => probeOut({ trusted: false, fingerprint: 'ab'.repeat(32), phrase: PHRASE });

  async function submit(p: FakePlatform) {
    show(p);
    const u = user();
    await openCard(u, /Unisciti/);
    await type(u, 'Indirizzo del server', 'https://casa.example');
    await type(u, 'Codice di abbinamento', '123456');
    await u.click(screen.getAllByRole('button', { name: 'Unisciti' }).find((b) => b.getAttribute('type') === 'submit')!);
    return u;
  }

  it('shows the phrase, and cancelling saves nothing and sends nothing', async () => {
    const p = platformWith({ 'POST /api/v1/pairing/redeem': { status: 200, body: AUTH } });
    p.setProbe(untrusted());
    const u = await submit(p);
    const dialog = await screen.findByRole('dialog', { name: 'Controlla la frase' });
    for (const word of PHRASE.split(' ')) expect(within(dialog).getByText(word)).toBeInTheDocument();
    expect(credentialPosts(p)).toHaveLength(0);
    await u.click(within(dialog).getByRole('button', { name: 'Annulla' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(p.state.items).toHaveLength(0);
    expect(credentialPosts(p)).toHaveLength(0);
    expect(screen.getByRole('textbox', { name: 'Codice di abbinamento' })).toHaveValue('123456');
  });

  it('saves the fingerprint and goes on once the words match', async () => {
    const p = platformWith({ 'POST /api/v1/pairing/redeem': { status: 200, body: AUTH } });
    p.setProbe(untrusted());
    const u = await submit(p);
    await u.click(await screen.findByRole('button', { name: 'Coincidono' }));
    await ready();
    expect(p.state.items.find((c) => c.id === p.state.active)?.fingerprint).toBe('ab'.repeat(32));
  });
});

describe('indirizzo non utilizzabile', () => {
  it.each([
    ['insecure_address', 'non è sicuro'],
    ['network', 'Non riesco a raggiungere il server'],
    ['not_bookeeper', 'non è un server Bookeeper'],
  ] as const)('explains %s in its own words and keeps the fields', async (error, text) => {
    const p = platformWith();
    p.setProbe(probeOut({ reachable: error === 'not_bookeeper', trusted: false, setup: null, server: null, error }));
    show(p);
    const u = user();
    await openCard(u, /Unisciti/);
    await type(u, 'Indirizzo del server', 'http://example.org');
    await type(u, 'Codice di abbinamento', '123456');
    await u.click(screen.getAllByRole('button', { name: 'Unisciti' }).find((b) => b.getAttribute('type') === 'submit')!);
    expect(await findAlert()).toHaveTextContent(text);
    expect(screen.getByRole('textbox', { name: 'Codice di abbinamento' })).toHaveValue('123456');
    expect(credentialPosts(p)).toHaveLength(0);
  });
});

describe('Crea su un server', () => {
  async function fill(u: ReturnType<typeof user>) {
    await openCard(u, /Crea su un server/);
    await type(u, 'Indirizzo del server', 'https://casa.example');
    await type(u, 'Codice di setup', 'ABCD-1234');
    await type(u, 'Nome della libreria', 'Casa Rossi');
    await type(u, 'Il tuo nome', 'Anna');
    await type(u, 'Email', 'anna@example.org');
    await u.type(screen.getByLabelText(/^Password/), 'password-lunga');
    await u.click(screen.getByRole('button', { name: 'Crea la libreria' }));
  }

  it('sends the whole setup with the code', async () => {
    const p = platformWith({ 'POST /api/v1/setup': { status: 201, body: AUTH } });
    p.setProbe(probeOut({ setup: { needs_setup: true, code_required: true } }));
    show(p);
    await fill(user());
    await ready();
    expect(posts(p, '/setup')[0]?.body).toEqual({
      setup_code: 'ABCD-1234',
      library_name: 'Casa Rossi',
      display_name: 'Anna',
      email: 'anna@example.org',
      password: 'password-lunga',
      device_kind: 'desktop',
      device_name: 'Test device',
    });
  });

  it('stays on the card and points to "Unisciti" when the server already has a library', async () => {
    const p = platformWith();
    p.setProbe(probeOut());
    show(p);
    const u = user();
    await fill(u);
    expect(await findAlert()).toHaveTextContent('ha già una libreria');
    expect(credentialPosts(p)).toHaveLength(0);
    await u.click(screen.getByRole('button', { name: /Vai a «Unisciti»/ }));
    expect(screen.getByRole('button', { name: /^Unisciti Collega/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('checks every field before sending', async () => {
    const p = platformWith();
    show(p);
    const u = user();
    await openCard(u, /Crea su un server/);
    await type(u, 'Email', 'senza-chiocciola');
    await u.type(screen.getByLabelText(/^Password/), 'corta');
    await u.click(screen.getByRole('button', { name: 'Crea la libreria' }));
    expect(screen.getByRole('textbox', { name: 'Indirizzo del server' })).toHaveFocus();
    const texts = alerts().map((a) => a.textContent);
    expect(texts).toEqual(expect.arrayContaining([expect.stringContaining('con la @'), expect.stringContaining('almeno 8 caratteri')]));
    expect(p.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });
});

describe('Bentornato', () => {
  const expired = fakeConnection({ id: 'c1', kind: 'remote', url: 'https://casa.example', library_name: 'Casa Rossi', user_name: 'Anna' });

  function expiredPlatform(routes: Routes = {}) {
    localStorage.setItem('bookeeper.welcome.login.c1', JSON.stringify({ email: 'anna@example.org', libraryId: 'l1' }));
    return platformWith(
      { 'GET /api/v1/me': fail(401, 'unauthorized'), 'POST /api/v1/auth/refresh': fail(401, 'refresh_invalid'), ...routes },
      { connections: { active: 'c1', items: [expired] } },
    );
  }

  it('asks only for the password, and a wrong one is reported', async () => {
    const p = expiredPlatform({ 'POST /api/v1/auth/login': fail(401, 'invalid_credentials') });
    show(p);
    const u = user();
    expect(await screen.findByRole('heading', { name: 'Bentornato in Casa Rossi' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Crea qui/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await u.type(screen.getByLabelText('Password'), 'sbagliata-di-molto');
    await u.click(screen.getByRole('button', { name: 'Accedi' }));
    expect(await findAlert()).toHaveTextContent('Email o password non corrette');
    expect(useSession.getState().status).toBe('welcome');
  });

  it('signs in on the saved connection with the right password', async () => {
    const p = expiredPlatform();
    // Once the new password is accepted the session answers `me` again.
    p.handle(async (r) => {
      if (r.path === '/api/v1/auth/login') {
        expect(r.connectionId).toBe('c1');
        return { status: 200, body: AUTH };
      }
      if (r.path === '/api/v1/me') return r.headers?.Authorization === 'Bearer new-access' ? { status: 200, body: ME } : { status: 401, body: { error_code: 'unauthorized', message: 'x' } };
      return { status: 401, body: { error_code: 'refresh_invalid', message: 'x' } };
    });
    show(p);
    const u = user();
    await u.type(await screen.findByLabelText('Password'), 'password-giusta');
    await u.click(screen.getByRole('button', { name: 'Accedi' }));
    await ready();
    expect(posts(p, '/auth/login')[0]?.body).toMatchObject({ email: 'anna@example.org', library_id: 'l1', password: 'password-giusta' });
  });

  it('shows the three cards on "Usa un\'altra libreria"', async () => {
    show(expiredPlatform());
    const u = user();
    await u.click(await screen.findByRole('button', { name: "Usa un'altra libreria" }));
    expect(screen.getAllByRole('button', { name: /Crea qui|Unisciti|Crea su un server/ })).toHaveLength(3);
  });

  it('forgets the library only after the user confirms', async () => {
    const p = expiredPlatform();
    show(p);
    const u = user();
    await u.click(await screen.findByRole('button', { name: 'Dimentica questa libreria' }));
    const dialog = await screen.findByRole('dialog', { name: 'Dimenticare questa libreria?' });
    await u.click(within(dialog).getByRole('button', { name: 'Annulla' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(p.state.items).toHaveLength(1);
    await u.click(screen.getByRole('button', { name: 'Dimentica questa libreria' }));
    await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Dimentica' }));
    await waitFor(() => expect(p.state.items).toHaveLength(0));
    expect(await screen.findByRole('button', { name: /Crea qui/ })).toBeInTheDocument();
  });

  it('needs no password for a local library', async () => {
    const local = fakeConnection({ id: 'c1', kind: 'local', library_name: 'Casa', access_token: null, refresh_token: 'r-old' });
    const p = platformWith(
      { 'GET /api/v1/me': fail(401, 'unauthorized'), 'POST /api/v1/auth/refresh': fail(401, 'refresh_invalid') },
      { connections: { active: 'c1', items: [local] } },
    );
    show(p);
    expect(await screen.findByRole('button', { name: 'Apri' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  });
});
