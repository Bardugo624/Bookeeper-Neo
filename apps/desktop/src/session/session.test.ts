import { beforeEach, describe, expect, it } from 'vitest';
import type { AuthOut } from '@bookeeper/api';
import { fakeConnection, fakePlatform } from '../platform/testing';
import { createAuthTransport } from './authTransport';
import { useSession } from './store';
import { ME, ok, unauthorized } from './fixtures';

const bearer = (h?: Record<string, string>) => h?.Authorization;

beforeEach(() => useSession.setState({ status: 'loading', connection: null, me: null, platform: null }));

describe('session start', () => {
  it('goes to welcome without connections', async () => {
    await useSession.getState().init(fakePlatform());
    expect(useSession.getState().status).toBe('welcome');
  });

  it('is ready with a valid token and loads me', async () => {
    const p = fakePlatform({
      connections: { active: 'c1', items: [fakeConnection()] },
      handler: (r) => (r.path === '/api/v1/me' && bearer(r.headers) === 'Bearer access-1' ? ok(ME) : unauthorized),
    });
    await useSession.getState().init(p);
    expect(useSession.getState().status).toBe('ready');
    expect(useSession.getState().me?.library.name).toBe('Casa Rossi');
    expect(p.calls[0]?.connectionId).toBe('c1');
  });

  it('renews on 401, retries and saves the new tokens with upsert', async () => {
    const p = fakePlatform({
      connections: { active: 'c1', items: [fakeConnection()] },
      handler: (r) => {
        if (r.path === '/api/v1/auth/refresh')
          return ok({ session: { access_token: 'access-2', refresh_token: 'refresh-2', device_id: 'd1', expires_in: 900 } });
        return bearer(r.headers) === 'Bearer access-2' ? ok(ME) : unauthorized;
      },
    });
    await useSession.getState().init(p);
    expect(useSession.getState().status).toBe('ready');
    expect(p.state.items[0]).toMatchObject({ access_token: 'access-2', refresh_token: 'refresh-2' });
  });

  it('goes to welcome when renewal fails, keeping the connection listed', async () => {
    const p = fakePlatform({ connections: { active: 'c1', items: [fakeConnection()] }, handler: () => unauthorized });
    await useSession.getState().init(p);
    expect(useSession.getState().status).toBe('welcome');
    expect(useSession.getState().connection?.id).toBe('c1');
    expect(p.state.items).toHaveLength(1);
  });
});

describe('authenticated transport', () => {
  it('shares one renewal between concurrent 401s', async () => {
    const p = fakePlatform({
      connections: { active: 'c1', items: [fakeConnection()] },
      handler: (r) => {
        if (r.path === '/api/v1/auth/refresh')
          return ok({ session: { access_token: 'access-2', refresh_token: 'refresh-2', device_id: 'd1', expires_in: 900 } });
        return bearer(r.headers) === 'Bearer access-2' ? ok({ path: r.path }) : unauthorized;
      },
    });
    useSession.setState({ status: 'ready', connection: p.state.items[0]!, platform: p });
    const t = createAuthTransport(p);
    const [a, b] = await Promise.all([t.request('GET', '/api/v1/a'), t.request('GET', '/api/v1/b')]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(p.calls.filter((c) => c.path === '/api/v1/auth/refresh')).toHaveLength(1);
  });

  it('does not renew or sign out on a 401 that is not an expired token', async () => {
    const p = fakePlatform({
      connections: { active: 'c1', items: [fakeConnection()] },
      handler: () => ({ status: 401, body: { error: { code: 'invalid_credentials', message: 'x' } } }),
    });
    useSession.setState({ status: 'ready', connection: p.state.items[0]!, platform: p });
    const res = await createAuthTransport(p).request('POST', '/api/v1/auth/confirm', {});
    expect(res.status).toBe(401);
    expect(p.calls.filter((c) => c.path === '/api/v1/auth/refresh')).toHaveLength(0);
    expect(useSession.getState().status).toBe('ready');
  });

  it('returns to welcome when the retried request is still 401', async () => {
    const p = fakePlatform({
      connections: { active: 'c1', items: [fakeConnection()] },
      handler: (r) =>
        r.path === '/api/v1/auth/refresh'
          ? ok({ session: { access_token: 'access-2', refresh_token: 'refresh-2', device_id: 'd1', expires_in: 900 } })
          : unauthorized,
    });
    useSession.setState({ status: 'ready', connection: p.state.items[0]!, platform: p });
    const res = await createAuthTransport(p).request('GET', '/api/v1/a');
    expect(res.status).toBe(401);
    expect(p.calls.filter((c) => c.path === '/api/v1/auth/refresh')).toHaveLength(1);
    expect(useSession.getState().status).toBe('welcome');
  });
});

describe('actions', () => {
  it('signOut calls logout, clears the tokens and returns to welcome', async () => {
    const p = fakePlatform({
      connections: { active: 'c1', items: [fakeConnection()] },
      handler: (r) => (r.path === '/api/v1/me' ? ok(ME) : { status: 204, body: null }),
    });
    await useSession.getState().init(p);
    await useSession.getState().signOut();
    expect(p.calls.some((c) => c.method === 'POST' && c.path === '/api/v1/auth/logout')).toBe(true);
    expect(p.state.items[0]).toMatchObject({ access_token: null, refresh_token: null });
    expect(useSession.getState().status).toBe('welcome');
    expect(useSession.getState().me).toBeNull();
  });

  it('signIn stores the tokens, activates the connection and becomes ready', async () => {
    const p = fakePlatform({ handler: (r) => (r.path === '/api/v1/me' ? ok(ME) : unauthorized) });
    await useSession.getState().init(p);
    const auth = {
      library: { id: 'l1', name: 'Casa Rossi' },
      user: { id: 'u1', display_name: 'Anna', role: 'owner' },
      session: { access_token: 'a', refresh_token: 'r', device_id: 'd9', expires_in: 900 },
    } as AuthOut;
    await useSession.getState().signIn(fakeConnection({ access_token: null, refresh_token: null }), auth);
    expect(useSession.getState().status).toBe('ready');
    expect(p.state.active).toBe('c1');
    expect(p.state.items[0]).toMatchObject({ access_token: 'a', library_name: 'Casa Rossi', user_name: 'Anna', device_id: 'd9' });
  });

  it('forget removes the connection and leaves a session on it', async () => {
    const p = fakePlatform({
      connections: { active: 'c1', items: [fakeConnection()] },
      handler: () => ok(ME),
    });
    await useSession.getState().init(p);
    await useSession.getState().forget('c1');
    expect(p.state.items).toEqual([]);
    expect(useSession.getState().status).toBe('welcome');
  });
});

describe('failed renewal memory', () => {
  const refreshes = (p: { calls: Array<{ path: string }> }) => p.calls.filter((c) => c.path === '/api/v1/auth/refresh').length;
  const setup = (refresh: () => { status: number; body: unknown }) => {
    const p = fakePlatform({
      connections: { active: 'c1', items: [fakeConnection()] },
      handler: (r) => (r.path === '/api/v1/auth/refresh' ? refresh() : unauthorized),
    });
    useSession.setState({ status: 'ready', connection: p.state.items[0]!, platform: p });
    return p;
  };

  it('retries the same token after a network error on renewal', async () => {
    const p = setup(() => {
      throw new Error('network down');
    });
    const t = createAuthTransport(p);
    await t.request('GET', '/api/v1/me');
    useSession.setState({ status: 'ready', connection: p.state.items[0]!, platform: p });
    await t.request('GET', '/api/v1/me');
    expect(refreshes(p)).toBe(2);
  });

  it('does not retry a token the server rejected', async () => {
    const p = setup(() => ({ status: 401, body: { error: { code: 'unauthorized', message: 'x' } } }));
    const t = createAuthTransport(p);
    await t.request('GET', '/api/v1/me');
    useSession.setState({ status: 'ready', connection: p.state.items[0]!, platform: p });
    await t.request('GET', '/api/v1/me');
    expect(refreshes(p)).toBe(1);
  });
});
