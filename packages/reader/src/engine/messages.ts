import type { FromFrame, ToFrame } from './protocol';

export const BK = 'reader';
export const VERSION = 1;

export interface Envelope<M> {
  bk: typeof BK;
  v: typeof VERSION;
  msg: M;
}

/** The envelope every message travels in. */
export function wrap<M extends ToFrame | FromFrame>(msg: M): Envelope<M> {
  return { bk: BK, v: VERSION, msg };
}

/**
 * The message of `event`, or null when it is not for us: another origin, another window, or not an envelope
 * of this protocol and version. Whoever receives checks this and ignores the rest.
 */
export function unwrap<M extends ToFrame | FromFrame>(event: MessageEvent, from: Window | null): M | null {
  if (event.origin !== location.origin) return null;
  if (from === null || event.source !== from) return null;
  const data: unknown = event.data;
  if (typeof data !== 'object' || data === null) return null;
  const env = data as Partial<Envelope<unknown>>;
  if (env.bk !== BK || env.v !== VERSION) return null;
  const msg = env.msg as { type?: unknown } | undefined;
  if (typeof msg !== 'object' || msg === null || typeof msg.type !== 'string') return null;
  return msg as M;
}
