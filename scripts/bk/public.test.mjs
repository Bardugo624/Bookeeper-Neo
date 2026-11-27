import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { channelVersions, serverVersion } from './public.mjs';

async function serve(routes) {
  const srv = createServer((req, res) => {
    const body = routes[req.url];
    res.statusCode = body ? 200 : 404;
    res.end(body ? JSON.stringify(body) : '');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() };
}

test('channelVersions reads R2', async () => {
  const r2 = await serve({ '/stable/latest.json': { version: '2.1.0' }, '/beta/latest.json': { version: '2.2.0-beta.1' } });
  process.env.BK_UPDATES_BASE = r2.base;
  try {
    assert.deepEqual(await channelVersions(), { stable: '2.1.0', beta: '2.2.0-beta.1', source: 'r2' });
  } finally {
    r2.close();
  }
});

test('channelVersions falls back to the VPS when R2 does not answer', async () => {
  const r2 = await serve({});
  const vps = await serve({ '/stable/latest.json': { version: '2.0.5' }, '/beta/latest.json': { version: '2.0.6-beta.1' } });
  process.env.BK_UPDATES_BASE = r2.base;
  process.env.BK_VPS_BASE = vps.base;
  try {
    assert.deepEqual(await channelVersions(), { stable: '2.0.5', beta: '2.0.6-beta.1', source: 'vps' });
  } finally {
    r2.close();
    vps.close();
  }
});

test('serverVersion reads the version field; null when down', async () => {
  const s = await serve({ '/server': { version: '2.1.3', tls: 'off', public_url: null, phone_ready: false } });
  process.env.BK_SERVER_URL = `${s.base}/server`;
  assert.equal(await serverVersion(), '2.1.3');
  process.env.BK_SERVER_URL = `${s.base}/nope`;
  assert.equal(await serverVersion(), null);
  s.close();
});
