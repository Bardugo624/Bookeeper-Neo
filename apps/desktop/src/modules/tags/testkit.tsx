import { useState } from 'react';
import type { TagOut } from '@bookeeper/api';
import { renderApp } from '../../app/testing';
import { fakeConnection, fakePlatform } from '../../platform/testing';
import { ME, ok } from '../../session/fixtures';
import { TagPicker } from './TagPicker';

type Req = { method: string; path: string; body?: unknown };
type Res = { status: number; body: unknown };

export const tag = (id: string, name: string, color = 'sage', book_count = 0): TagOut => ({ id, name, color, book_count });

export const TAGS: TagOut[] = [tag('t1', 'Fantasy', 'plum', 3), tag('t2', 'Classici', 'amber', 1), tag('t3', 'Saggi', 'night', 0)];

/** In-memory answers for the tag routes; `state.tags` is what the "server" holds. */
export function tagHandler(state: { tags: TagOut[] }) {
  let next = 100;
  return (r: Req): Res | undefined => {
    const path = r.path.split('?')[0]!;
    const exists = (name: string, except?: string) =>
      state.tags.some((x) => x.id !== except && x.name.toLowerCase() === name.trim().toLowerCase());
    const taken = { status: 409, body: { error_code: 'tag_exists', message: 'x' } };
    if (path === '/api/v1/tags' && r.method === 'GET') return ok({ items: state.tags });
    if (path === '/api/v1/tags' && r.method === 'POST') {
      const body = r.body as { name: string; color?: string };
      if (exists(body.name)) return taken;
      const made = tag(`t${next++}`, body.name.trim(), body.color ?? 'sage');
      state.tags = [...state.tags, made];
      return { status: 201, body: made };
    }
    const one = /^\/api\/v1\/tags\/([^/]+)$/.exec(path);
    if (one && r.method === 'PATCH') {
      const id = decodeURIComponent(one[1]!);
      const body = r.body as { name?: string; color?: string };
      if (body.name && exists(body.name, id)) return taken;
      state.tags = state.tags.map((x) => (x.id === id ? { ...x, ...body } : x));
      return ok(state.tags.find((x) => x.id === id));
    }
    if (one && r.method === 'DELETE') {
      state.tags = state.tags.filter((x) => x.id !== decodeURIComponent(one[1]!));
      return { status: 204, body: null };
    }
    const put = /^\/api\/v1\/books\/([^/]+)\/tags$/.exec(path);
    if (put && r.method === 'PUT') {
      const ids = (r.body as { tag_ids: string[] }).tag_ids;
      return ok({
        id: decodeURIComponent(put[1]!), title: 'x', authors: [], on_loan: false, reading: null, created_at: 0, updated_at: 0,
        tags: ids.map((id) => state.tags.find((x) => x.id === id) ?? tag(id, id)),
      });
    }
    return undefined;
  };
}

/** The picker alone, on a page of the app; `calls` are the values it reported. */
export function renderPicker(state: { tags: TagOut[] }, initial: string[] = []) {
  const reported: string[][] = [];
  const handler = tagHandler(state);
  const platform = fakePlatform({
    connections: { active: 'c1', items: [fakeConnection()] },
    handler: (r) => handler(r) ?? (r.path === '/api/v1/me' ? ok(ME) : { status: 404, body: { error_code: 'not_found', message: 'x' } }),
  });
  function Harness() {
    const [value, setValue] = useState(initial);
    return (
      <>
        <TagPicker
          value={value}
          onChange={(next) => {
            reported.push(next);
            setValue(next);
          }}
        />
        <output aria-label="valore">{value.join(',')}</output>
      </>
    );
  }
  const view = renderApp({ platform, modules: [{ id: 'harness', nav: { labelKey: 'tags.title', icon: 'book', to: '/harness', group: 'main', order: 1 }, routes: [{ path: '/harness', element: <Harness /> }] }], route: '/harness' });
  return { ...view, platform, reported };
}
