import { useEffect, useState } from 'react';

/** Returns the image source to render, or undefined once it failed to load (placeholder fallback). */
export function useCoverImage(src: string | undefined) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return { src: failed ? undefined : src || undefined, onError: () => setFailed(true) };
}

/** First alphanumeric character of a title, uppercased; empty when there is none. */
export function initialOf(title: string): string {
  const m = title.match(/[\p{L}\p{N}]/u);
  return m ? m[0].toUpperCase() : '';
}
