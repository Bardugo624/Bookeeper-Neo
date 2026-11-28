import { describe, expect, it } from 'vitest';
import { unwrap, wrap } from './messages';

function frameWindow(): Window {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  return iframe.contentWindow!;
}
const event = (init: MessageEventInit) => new MessageEvent('message', init);

describe('messages', () => {
  it('messages_carry_bk_and_version', () => {
    expect(wrap({ type: 'next' })).toEqual({ bk: 'reader', v: 1, msg: { type: 'next' } });
  });

  it('accepts a message of this protocol from the expected window and origin', () => {
    const win = frameWindow();
    const data = wrap({ type: 'ready' });
    expect(unwrap(event({ data, origin: location.origin, source: win }), win)).toEqual({ type: 'ready' });
  });

  it('foreign_origins_and_windows_are_ignored', () => {
    const win = frameWindow();
    const other = frameWindow();
    const data = wrap({ type: 'ready' });
    expect(unwrap(event({ data, origin: 'https://evil.example', source: win }), win)).toBeNull();
    expect(unwrap(event({ data, origin: location.origin, source: other }), win)).toBeNull();
    expect(unwrap(event({ data, origin: location.origin, source: win }), null)).toBeNull();
  });

  it('ignores what is not an envelope of this protocol and version', () => {
    const win = frameWindow();
    const at = (data: unknown) => unwrap(event({ data, origin: location.origin, source: win }), win);
    expect(at('ready')).toBeNull();
    expect(at(null)).toBeNull();
    expect(at({ bk: 'other', v: 1, msg: { type: 'ready' } })).toBeNull();
    expect(at({ bk: 'reader', v: 2, msg: { type: 'ready' } })).toBeNull();
    expect(at({ bk: 'reader', v: 1, msg: {} })).toBeNull();
  });
});
