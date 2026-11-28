import { useEffect, useMemo } from 'react';
import { createPositionKeeper, type PositionKeeper, type ReaderBackend } from '../data';
import type { Engine } from '../engine';
import { nowSeconds } from './helpers';

function storage(): Pick<Storage, 'getItem' | 'setItem'> {
  try {
    return window.localStorage;
  } catch {
    return { getItem: () => null, setItem: () => {} };
  }
}

export function usePositionKeeper(backend: ReaderBackend, fileId: string): PositionKeeper {
  return useMemo(() => createPositionKeeper(backend, fileId, storage(), nowSeconds), [backend, fileId]);
}

/**
 * Hands every page change to the keeper, saves when the page is left or hidden, and sends what waited
 * offline when the network comes back.
 */
export function usePositionSaving(keeper: PositionKeeper, engine: Engine | null): void {
  useEffect(() => {
    if (!engine) return;
    return engine.on('relocate', (m) => {
      keeper.record(m.at);
    });
  }, [engine, keeper]);

  useEffect(() => {
    const flush = () => void keeper.flush().catch(() => undefined);
    const hidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    const online = () => void keeper.drain().catch(() => undefined);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('online', online);
    online();
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('online', online);
      flush();
    };
  }, [keeper]);
}
