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
