/** Compares `major.minor.patch`; null when either side does not parse. Pre-release tails are ignored. */
export function compareVersions(a: string, b: string): number | null {
  const parse = (v: string): number[] | null => {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i += 1) {
    if (x[i]! !== y[i]!) return x[i]! < y[i]! ? -1 : 1;
  }
  return 0;
}

export type Relation = 'older' | 'same' | 'newer' | 'legacy';

/** How the installed version stands against the one in this Setup. Anything unreadable counts as newer: never overwrite it. */
export function relation(installed: { version: string; legacy: boolean }, payloadVersion: string): Relation {
  if (installed.legacy) return 'legacy';
  const c = compareVersions(installed.version, payloadVersion);
  if (c === null) return 'newer';
  return c < 0 ? 'older' : c === 0 ? 'same' : 'newer';
}
