import { useCallback, useEffect, useRef, useState } from 'react';
import type { BarcodeResult } from '../../platform';
import { classifyCode, parseIsbn, type Isbn } from './isbn';

const NOTICE_MS = 2500;

function vibrate(): void {
  try {
    navigator.vibrate?.(40);
  } catch {
    // No vibration motor, or the browser refuses: the sheet opening is the feedback.
  }
}

/**
 * What the reader and the manual field deliver: at most one ISBN at a time is "open". While it is, every
 * code is ignored, so the same book read ten times costs one lookup; closing it lets the reading go on.
 */
export function useScanFlow() {
  const [isbn, setIsbn] = useState<Isbn | null>(null);
  const [notice, setNotice] = useState(false);
  const open = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const take = useCallback((found: Isbn) => {
    open.current = true;
    setIsbn(found);
  }, []);

  const onCode = useCallback(
    (r: BarcodeResult) => {
      if (open.current) return;
      const code = classifyCode(r.text);
      if (code.kind === 'isbn') {
        vibrate();
        take(code.isbn);
      } else {
        setNotice(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setNotice(false), NOTICE_MS);
      }
    },
    [take],
  );

  /** Typed by hand; `false` when the text is not an ISBN. */
  const submitManual = useCallback(
    (text: string) => {
      const found = parseIsbn(text);
      if (!found) return false;
      take(found);
      return true;
    },
    [take],
  );

  const close = useCallback(() => {
    open.current = false;
    setIsbn(null);
  }, []);

  return { isbn, notice, onCode, submitManual, close };
}
