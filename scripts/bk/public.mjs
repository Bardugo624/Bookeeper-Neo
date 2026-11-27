// What the outside world serves: update manifests and the server version.
const updatesBase = () => process.env.BK_UPDATES_BASE || 'https://updates.neokeeper.dev/v2';
const vpsBase = () => process.env.BK_VPS_BASE || 'https://app.neokeeper.dev/updates';
const serverUrl = () => process.env.BK_SERVER_URL || 'https://app.neokeeper.dev/api/v1/server';

// JSON from a URL, or null when it does not answer in 10 s or is not OK.
export async function fetchJson(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export { updatesBase };

// Versions the channels serve now. R2 first; the VPS for any channel R2 does not answer.
export async function channelVersions() {
  const out = { stable: null, beta: null, source: 'r2' };
  for (const ch of ['stable', 'beta']) {
    let m = await fetchJson(`${updatesBase()}/${ch}/latest.json`);
    if (!m?.version) {
      m = await fetchJson(`${vpsBase()}/${ch}/latest.json`);
      if (m?.version) out.source = 'vps';
    }
    out[ch] = m?.version ?? null;
  }
  return out;
}

export async function serverVersion() {
  const s = await fetchJson(serverUrl()); // ServerOut in packages/api: { version, tls, public_url, phone_ready }
  return s?.version ?? null;
}
