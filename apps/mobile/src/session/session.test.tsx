import { beforeEach, describe, expect, it } from 'vitest';
import { fakePlatform } from '../platform/testing';
import { renderMobile } from '../app/testing';
import { screen } from '@testing-library/react';
import { SESSION_KEY } from './tokens';
import { useSession } from './store';
import { createAuthTransport } from './authTransport';
import { ME, ok, pair, refreshed, unauthorized } from './fixtures';

const bearer = (h?: Record<string, string>) => h?.Authorization;

beforeEach(() => useSession.setState({ status: 'loading', tokens: null, me: null, platform: null }));

describe('session start', () => {
  it('is unpaired without a token', async () => {
    const p = fakePlatform();
    await useSession.getState().init(p);
    expect(useSession.getState().status).toBe('unpaired');
    expect(p.fake.calls).toHaveLength(0);
  });

  it('is ready with a valid token and loads me', async () => {
    const p = fakePlatform({ handler: (r) => (bearer(r.headers) === 'Bearer access-1' ? ok(ME) : unauthorized()) });
    pair(p.storage);
    await useSession.getState().init(p);
    expect(useSession.getState().status).toBe('ready');
    expect(useSession.getState().me?.library.name).toBe('Casa Rossi');
  });

  it('renews on token_expired and stores the new tokens', async () => {
    const p = fakePlatform({
      handler: (r) => {
        if (r.path === '/api/v1/auth/refresh') return refreshed(2);
        return bearer(r.headers) === 'Bearer access-2' ? ok(ME) : unauthorized('token_expired');
      },
    });
    pair(p.storage);
    await useSession.getState().init(p);
    expect(useSession.getState().status).toBe('ready');
    expect(JSON.parse(p.storage.get(SESSION_KEY)!)).toEqual({
      access_token: 'access-2',
      refresh_token: 'refresh-2',
      device_id: 'd1',
    });
  });

  it('is unpaired and forgets the tokens when the device was revoked', async () => {
    const p = fakePlatform({ handler: () => unauthorized('device_revoked') });
    pair(p.storage);
    await useSession.getState().init(p);
    expect(useSession.getState().status).toBe('unpaired');
    expect(p.storage.get(SESSION_KEY)).toBeNull();
    expect(p.fake.calls.map((c) => c.path)).toEqual(['/api/v1/me']);
  });

  it('is unpaired when the renewal is refused', async () => {
    const p = fakePlatform({ handler: (r) => (r.path.endsWith('/auth/refresh') ? unauthorized('invalid_refresh') : unauthorized('token_expired')) });
    pair(p.storage);
    await useSession.getState().init(p);
    expect(useSession.getState().status).toBe('unpaired');
    expect(p.storage.get(SESSION_KEY)).toBeNull();
  });

  it('stays paired when the server cannot be reached at launch', async () => {
    const p = fakePlatform({ handler: () => ({ status: 503, body: null }) });
    pair(p.storage);
    await useSession.getState().init(p);
    expect(useSession.getState().status).toBe('ready');
    expect(p.storage.get(SESSION_KEY)).not.toBeNull();
  });
});

describe('authenticated transport', () => {
  async function started(handler: Parameters<typeof fakePlatform>[0]) {
    const p = fakePlatform(handler);
    pair(p.storage);
    useSession.setState({ status: 'ready', tokens: JSON.parse(p.storage.get(SESSION_KEY)!), platform: p });
    return p;
  }

  it('shares one renewal between simultaneous 401s', async () => {
    const p = await started({
      handler: (r) => {
        if (r.path === '/api/v1/auth/refresh') return refreshed(2);
        return bearer(r.headers) === 'Bearer access-2' ? ok({ path: r.path }) : unauthorized('token_expired');
      },
    });
    const t = createAuthTransport(p);
    const [a, b] = await Promise.all([t.request('GET', '/api/v1/a'), t.request('GET', '/api/v1/b')]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(p.fake.calls.filter((c) => c.path === '/api/v1/auth/refresh')).toHaveLength(1);
  });

  it('does not renew on a 401 that is not about the token', async () => {
    const p = await started({ handler: () => unauthorized('invalid_credentials') });
    const res = await createAuthTransport(p).request('POST', '/api/v1/auth/confirm', {});
    expect(res.status).toBe(401);
    expect(p.fake.calls).toHaveLength(1);
    expect(useSession.getState().status).toBe('ready');
  });

  it('keeps the session when the renewal cannot reach the server', async () => {
    const p = await started({ handler: (r) => (r.path.endsWith('/auth/refresh') ? { status: 503, body: null } : unauthorized('token_expired')) });
    const res = await createAuthTransport(p).request('GET', '/api/v1/a');
    expect(res.status).toBe(401);
    expect(useSession.getState().status).toBe('ready');
    expect(p.storage.get(SESSION_KEY)).not.toBeNull();
  });
});

describe('routing by session', () => {
  it('sends an unpaired phone to /pair', async () => {
    const { router } = renderMobile({ route: '/search' });
    await screen.findByText('Telefono non collegato');
    expect(router.state.location.pathname).toBe('/pair');
  });

  it('shows nothing of the app before the session is known, then the empty state', async () => {
    const p = fakePlatform({ handler: () => ok(ME) });
    pair(p.storage);
    renderMobile({ platform: p });
    expect(await screen.findByText('Niente da mostrare')).toBeInTheDocument();
  });
});
