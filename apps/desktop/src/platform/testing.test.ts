import { expect, it } from 'vitest';
import { fakePlatform } from './testing';

it('the fake platform records saveFile calls and returns the configured result', async () => {
  const p = fakePlatform();
  const req = { suggestedName: 'a.zip', bytes: new Uint8Array([1, 2]), mime: 'application/zip' };
  expect(await p.saveFile(req)).toEqual({ saved: true });
  p.setSaveResult({ saved: false });
  expect(await p.saveFile(req)).toEqual({ saved: false });
  expect(p.saved).toEqual([req, req]);
});

it('fake notifications are null unless asked for and follow the permission flow', async () => {
  expect(fakePlatform().notifications).toBeNull();
  const p = fakePlatform({ notifications: { permission: 'prompt', answer: 'denied' } });
  expect(await p.notifications!.permission()).toBe('prompt');
  expect(await p.notifications!.request()).toBe('denied');
  expect(await p.notifications!.permission()).toBe('denied');
  await p.notifications!.send({ title: 'T', body: 'B' });
  expect(p.notificationsFake).toMatchObject({ requests: 1, sent: [{ title: 'T', body: 'B' }] });
});
