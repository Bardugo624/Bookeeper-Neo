// The only place in the UI package where literal colors may live: muted "cloth" cover tones.
export const CLOTH_TONES: readonly string[] = [
  '#3e6252', // deep sage
  '#9c5a3c', // terracotta
  '#3a4a6b', // night
  '#6b3a5f', // plum
  '#7d5a2a', // dark amber
  '#4a4a4a', // graphite
  '#5a6b3a', // moss
  '#8a4452', // wine
  '#2f5d63', // teal
  '#6e5a48', // umber
];

/** Deterministic tone for a seed; the empty string maps to the first tone. */
export function clothTone(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return CLOTH_TONES[h % CLOTH_TONES.length]!;
}
