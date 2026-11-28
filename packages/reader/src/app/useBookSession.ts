import { useEffect, useRef, useState } from 'react';
import { ApiError, type ReadingOut } from '@bookeeper/api';
import { Engine } from '../engine';
import type { FrameLayout, FromFrame, Relocation } from '../engine/protocol';
import { sourcesFrom, type PositionKeeper, type ReaderBackend } from '../data';
import { openingTarget, type LocalPosition, type ResumeSource } from '../model';
import type { ReaderError } from '../ui/view';

export type Opened = Extract<FromFrame, { type: 'opened' }>;
export type SessionStatus = 'loading' | 'ready' | ReaderError;

export interface BookSession {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  engine: Engine | null;
  status: SessionStatus;
  /** 0 to 1: how much of the file has arrived. */
  progress: number;
  opened: Opened | null;
  relocation: Relocation | null;
  /** The position this device had before opening, for «Continua da …». */
  localAtOpen: LocalPosition | null;
  sources: ResumeSource[] | null;
  reading: ReadingOut | null;
  file: Blob | null;
}

interface Input {
  backend: ReaderBackend;
  file: { id: string; name: string };
  keeper: PositionKeeper;
  layout: FrameLayout;
}

/**
 * Builds the engine on the frame, loads the file and opens the book where the local position says (or where
 * this device's own copy on the server says, or at the start). Later layouts reach the frame with `setLayout`
 * only: a change never moves the page.
 */
export function useBookSession({ backend, file, keeper, layout }: Input): BookSession {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [progress, setProgress] = useState(0);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [relocation, setRelocation] = useState<Relocation | null>(null);
  const [localAtOpen, setLocalAtOpen] = useState<LocalPosition | null>(null);
  const [sources, setSources] = useState<ResumeSource[] | null>(null);
  const [reading, setReading] = useState<ReadingOut | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const keeperRef = useRef(keeper);
  keeperRef.current = keeper;
  // The layout the frame holds now, as text, to send only what changed.
  const sent = useRef<string | null>(null);

  useEffect(() => {
    const frame = iframeRef.current;
    if (!frame) return;
    const eng = new Engine(frame);
    const ctl = new AbortController();
    let alive = true;
    setEngine(eng);
    const off = eng.on('relocate', (m) => setRelocation(m.at));

    const positions = backend.listPositions().catch(() => []);
    const readingP = backend.getReading().catch(() => null);
    const sourcesP = Promise.all([positions, readingP]).then(([p, r]) => ({ r, list: sourcesFrom(p, r, file.id, backend.deviceId) }));

    void (async () => {
      let data: Blob;
      try {
        data = await backend.loadFile(ctl.signal, (f) => alive && setProgress(f));
      } catch (e) {
        if (!alive) return;
        setStatus(e instanceof ApiError && e.status === 404 ? 'missing' : 'offline');
        return;
      }
      if (!alive) return;
      setBlob(data);
      const local = keeperRef.current.local();
      setLocalAtOpen(local);
      const resolved = local ? null : await sourcesP;
      if (!alive) return;
      const at = local ? { cfi: local.value } : openingTarget(null, resolved?.list ?? [], backend.deviceId);
      const first = layoutRef.current;
      sent.current = JSON.stringify(first);
      try {
        const info = await eng.open(data, file.name, at, first);
        if (!alive) return;
        setOpened(info);
        setStatus('ready');
      } catch {
        if (alive) setStatus('open_failed');
        return;
      }
      const all = await sourcesP;
      if (!alive) return;
      setReading(all.r);
      setSources(all.list);
    })();

    return () => {
      alive = false;
      ctl.abort();
      off();
      void eng.close();
    };
    // The book is fixed for the life of the screen: a new book mounts a new one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, file.id]);

  const key = JSON.stringify(layout);
  useEffect(() => {
    if (!engine || !opened || sent.current === key) return;
    sent.current = key;
    engine.setLayout(layout);
  }, [engine, opened, key, layout]);

  return { iframeRef, engine, status, progress, opened, relocation, localAtOpen, sources, reading, file: blob };
}
