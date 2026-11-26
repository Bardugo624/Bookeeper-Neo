import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../app/testing';
import { fakeConnection, fakePlatform } from '../../platform/testing';
import { ME, ok } from '../../session/fixtures';
import { TagRow } from './TagRow';
import { tag } from './testkit';

describe('TagRow color while saving', () => {
  it('keeps the arrows from moving the focus during a color save', async () => {
    let patches = 0;
    const platform = fakePlatform({
      connections: { active: 'c1', items: [fakeConnection()] },
      // The save never answers, so the row stays in its saving state.
      handler: (r) => {
        if (r.path === '/api/v1/me') return ok(ME);
        if (r.method === 'PATCH') {
          patches += 1;
          return new Promise(() => {});
        }
        return { status: 404, body: { error_code: 'not_found', message: 'x' } };
      },
    });
    const row = <TagRow tag={tag('t1', 'Fantasy', 'amber')} canWrite onDelete={() => {}} />;
    renderApp({
      platform,
      modules: [{ id: 'harness', nav: { labelKey: 'tags.title', icon: 'book', to: '/harness', group: 'main', order: 1 }, routes: [{ path: '/harness', element: <ul>{row}</ul> }] }],
      route: '/harness',
    });
    const amber = await screen.findByRole('radio', { name: /amber|ambra/i });
    amber.focus();
    fireEvent.keyDown(amber, { key: 'ArrowRight' });
    await waitFor(() => expect(patches).toBe(1));
    const radios = screen.getAllByRole('radio');
    const before = document.activeElement;
    fireEvent.keyDown(before === document.body ? radios[0]! : (before as Element), { key: 'ArrowRight' });
    await Promise.resolve();
    expect(patches).toBe(1);
    expect(document.activeElement).toBe(before);
  });
});
