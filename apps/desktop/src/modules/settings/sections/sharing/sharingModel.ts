export const PORT_MIN = 1024;
export const PORT_MAX = 65535;

/** A port as typed: whole number within the unprivileged range, or `null`. */
export function parsePort(text: string): number | null {
  const s = text.trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= PORT_MIN && n <= PORT_MAX ? n : null;
}

/** The phrase as the shell sends it, split into its words. */
export function phraseWords(phrase: string): string[] {
  return phrase.trim().split(/\s+/).filter(Boolean);
}
