import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../app/testing';
import type { AppModule } from '../app/types';
import { fakeConnection, fakePlatform } from '../platform/testing';
import { ME, ok } from '../session/fixtures';

const page: AppModule = { id: 'p', routes: [{ path: '/p', element: <h1>Pagina</h1> }] };

function badge(displayName: string) {
  const me = { ...ME, user: { ...ME.user, display_name: displayName }, library: { ...ME.library, name: 'Casa Rossi' } };
  const platform = fakePlatform({
    connections: { active: 'c1', items: [fakeConnection()] },
    handler: (r) => (r.path === '/api/v1/me' ? ok(me) : { status: 204, body: null }),
  });
  renderApp({ platform, modules: [page], route: '/p' });
}

describe('library avatar', () => {
  it("shows the initial of the person's name", async () => {
    badge('Giulia');
    const name = await screen.findByText('Casa Rossi');
    expect(name.parentElement?.previousElementSibling).toHaveTextContent(/^G$/);
  });

  it('falls back to the library initial without a name', async () => {
    badge('');
    const name = await screen.findByText('Casa Rossi');
    expect(name.parentElement?.previousElementSibling).toHaveTextContent(/^C$/);
  });
});
