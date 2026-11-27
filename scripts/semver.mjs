// Minimal SemVer 2.0.0 helpers (no build metadata, no leading "v").
const ID = '(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)';
const RE = new RegExp(`^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-(${ID}(?:\\.${ID})*))?$`);

export function parse(v) {
  const m = typeof v === 'string' ? RE.exec(v) : null;
  if (!m) throw new Error(`Versione non valida: "${v}"`);
  const pre = m[4] ? m[4].split('.').map((p) => (/^\d+$/.test(p) ? Number(p) : p)) : [];
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre };
}

const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);

export function compare(a, b) {
  const x = parse(a);
  const y = parse(b);
  for (const k of ['major', 'minor', 'patch']) {
    const c = cmp(x[k], y[k]);
    if (c) return c;
  }
  if (!x.pre.length || !y.pre.length) return cmp(y.pre.length, x.pre.length) && (x.pre.length ? -1 : 1);
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    if (p === q) continue;
    const pn = typeof p === 'number';
    const qn = typeof q === 'number';
    if (pn && qn) return cmp(p, q);
    if (pn) return -1;
    if (qn) return 1;
    return cmp(p, q);
  }
  return 0;
}

export const isPrerelease = (v) => parse(v).pre.length > 0;

export function inc(v, kind) {
  const { major, minor, patch, pre } = parse(v);
  const wasPre = pre.length > 0;
  switch (kind) {
    case 'patch':
      return wasPre ? `${major}.${minor}.${patch}` : `${major}.${minor}.${patch + 1}`;
    case 'minor':
      return wasPre && patch === 0 ? `${major}.${minor}.0` : `${major}.${minor + 1}.0`;
    case 'major':
      return wasPre && minor === 0 && patch === 0 ? `${major}.0.0` : `${major + 1}.0.0`;
    case 'beta': {
      if (!wasPre) return `${major}.${minor + 1}.0-beta.1`;
      if (pre.length === 2 && pre[0] === 'beta' && typeof pre[1] === 'number') {
        return `${major}.${minor}.${patch}-beta.${pre[1] + 1}`;
      }
      throw new Error(`Non posso passare a beta da ${v}`);
    }
    default:
      throw new Error(`Tipo di aumento sconosciuto: "${kind}"`);
  }
}
