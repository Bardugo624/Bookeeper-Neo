// Turns a release source (GitHub today, the R2 index tomorrow) into one shape
// the page renders: { version, date, notesUrl, files: [{ id, url, size, name }] }.
// No version is ever written by hand: everything comes from the source.

export const REPO = 'Bardugo624/Bookeeper-Neo';
export const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
export const GITHUB_LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;
export const INDEX_URL = 'https://updates.neokeeper.dev/v2/downloads/stable.json';
// Updater manifests (Tauri format: version, notes, pub_date). The apps read the same files,
// so the page announces exactly what the apps are offered.
export const R2_MANIFEST = 'https://updates.neokeeper.dev/v2/stable/latest.json';
// The VPS manifest, served on the site's own origin by its Caddy block (no CORS needed).
export const VPS_MANIFEST = '/updates/stable/latest.json';
export const MANIFESTS = [R2_MANIFEST, VPS_MANIFEST];

// File ids the page knows. Order is the order of the full list.
export const FILE_PATTERNS = [
  ['windows', /_x64-setup\.exe$/i],
  ['mac-arm', /_aarch64\.dmg$/i],
  ['mac-intel', /_x64\.dmg$/i],
  ['appimage', /_amd64\.AppImage$/i],
  ['deb', /_amd64\.deb$/i],
  ['server-linux-amd64', /^bookeeper-server-.+-linux-amd64\.tar\.gz$/i],
  ['server-linux-arm64', /^bookeeper-server-.+-linux-arm64\.tar\.gz$/i],
  ['server-macos-arm64', /^bookeeper-server-.+-macos-arm64\.tar\.gz$/i],
  ['server-macos-amd64', /^bookeeper-server-.+-macos-amd64\.tar\.gz$/i],
  ['server-windows-amd64', /^bookeeper-server-.+-windows-amd64\.zip$/i],
  ['checksums', /^SHA256SUMS$/],
];

export function classify(name) {
  const hit = FILE_PATTERNS.find(([, re]) => re.test(name));
  return hit ? hit[0] : null;
}

function sortFiles(files) {
  const order = FILE_PATTERNS.map(([id]) => id);
  return files.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

export function fromGithub(release) {
  if (!release || !Array.isArray(release.assets)) throw new Error('release without assets');
  const files = release.assets
    .map((a) => ({ id: classify(a.name), name: a.name, url: a.browser_download_url, size: a.size }))
    .filter((f) => f.id && f.url);
  if (!files.length) throw new Error('release without known files');
  return {
    version: String(release.tag_name || '').replace(/^v/, ''),
    date: release.published_at || null,
    notes: typeof release.body === 'string' ? release.body : '',
    notesUrl: release.html_url || RELEASES_URL,
    files: sortFiles(files),
  };
}

// The R2 index is described in the spec as "version, date, link per platform".
// Accepted: { version, date, notes?, files: [{ name, url, size? }] }
// or { version, date, platforms: { <anything>: { name?, url, size? } } }.
// Ids come from the file name, as for GitHub, so the two sources agree.
export function fromIndex(index) {
  if (!index || !index.version) throw new Error('index without version');
  const raw = Array.isArray(index.files) ? index.files : Object.values(index.platforms || {});
  const files = raw
    .map((f) => {
      const name = f.name || decodeURIComponent(String(f.url || '').split('/').pop() || '');
      return { id: classify(name), name, url: f.url, size: f.size ?? null };
    })
    .filter((f) => f.id && f.url);
  if (!files.length) throw new Error('index without known files');
  return {
    version: String(index.version).replace(/^v/, ''),
    date: index.date || index.pub_date || null,
    notes: typeof index.notes === 'string' && !/^https?:/.test(index.notes) ? index.notes : '',
    notesUrl: index.notesUrl || (/^https?:/.test(index.notes || '') ? index.notes : RELEASES_URL),
    files: sortFiles(files),
  };
}

const SOURCES = {
  index: { url: INDEX_URL, parse: fromIndex },
  github: { url: GITHUB_LATEST, parse: fromGithub },
};

async function getJson(url, fetchImpl) {
  const res = await fetchImpl(url, { headers: { Accept: 'application/json' }, cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

// Tries each file source in order; the first that answers with known files wins.
// Then the notes: the first updater manifest that announces the same version
// (R2, then the VPS) gives them; the release's own notes stay as the fallback.
export async function loadRelease(order = ['github'], fetchImpl = globalThis.fetch, manifests = MANIFESTS) {
  let release = null;
  let lastError = null;
  for (const key of order) {
    const source = SOURCES[key];
    if (!source) continue;
    try {
      release = { source: key, ...source.parse(await getJson(source.url, fetchImpl)) };
      break;
    } catch (err) {
      lastError = err;
    }
  }
  if (!release) throw lastError || new Error('no download source');
  for (const url of manifests) {
    try {
      const m = await getJson(url, fetchImpl);
      if (String(m.version || '').replace(/^v/, '') !== release.version) continue;
      if (typeof m.notes === 'string' && m.notes.trim()) release.notes = m.notes;
      if (!release.date && m.pub_date) release.date = m.pub_date;
      release.notesSource = url;
      break;
    } catch {
      /* manifest not reachable: keep the release's own notes */
    }
  }
  return release;
}

// The CHANGELOG subset the apps support (### headings, lists, **bold**, *italic*,
// `code`, [text](https://...)), as safe HTML: text is escaped before any markup is added.
const SECTION = {
  it: { Added: 'Novità', Changed: 'Modifiche', Fixed: 'Correzioni', Removed: 'Rimosso', Security: 'Sicurezza', Deprecated: 'Deprecato' },
  en: { Added: 'New', Changed: 'Changed', Fixed: 'Fixed', Removed: 'Removed', Security: 'Security', Deprecated: 'Deprecated' },
};
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function inline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
}
export function notesToHtml(md, lang = 'it') {
  if (!md) return '';
  const out = [];
  let item = null;
  let list = false;
  const flush = () => {
    if (item !== null) out.push(`<li>${inline(item)}</li>`);
    item = null;
  };
  const close = () => {
    flush();
    if (list) out.push('</ul>');
    list = false;
  };
  for (const raw of md.replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd();
    const h = line.match(/^#{1,6}\s+(.*)$/);
    const li = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
    if (h) {
      close();
      const title = h[1].trim();
      out.push(`<h4>${escapeHtml((SECTION[lang] || SECTION.it)[title] || title)}</h4>`);
    } else if (li) {
      flush();
      if (!list) out.push('<ul>');
      list = true;
      item = li[1];
    } else if (!line.trim()) {
      close();
    } else if (item !== null) {
      item += ` ${line.trim()}`;
    } else {
      close();
      out.push(`<p>${inline(line.trim())}</p>`);
    }
  }
  close();
  return out.join('');
}

// Which installer to bill first. `ua` is navigator.userAgent, `hints` the
// optional result of userAgentData.getHighEntropyValues().
export function detectSystem(ua = '', hints = null) {
  const platform = (hints && hints.platform) || '';
  if (/iPhone|iPad|iPod/i.test(ua) || /Android/i.test(ua)) return { kind: 'phone', primary: null };
  if (/Windows/i.test(platform) || /Windows NT/i.test(ua)) return { kind: 'windows', primary: 'windows' };
  if (/mac/i.test(platform) || /Macintosh|Mac OS X/i.test(ua)) {
    // Safari never says which chip it runs on: Apple Silicon is the safe bet today,
    // and the Intel file stays one click away.
    const intel = hints && hints.architecture === 'x86';
    return { kind: 'mac', primary: intel ? 'mac-intel' : 'mac-arm', secondary: intel ? 'mac-arm' : 'mac-intel' };
  }
  if (/Linux|X11|CrOS/i.test(platform + ' ' + ua)) return { kind: 'linux', primary: 'appimage', secondary: 'deb' };
  return { kind: 'unknown', primary: null };
}

export function formatSize(bytes, lang = 'it') {
  if (!bytes && bytes !== 0) return '';
  const mb = bytes / 1048576;
  const n = new Intl.NumberFormat(lang, { maximumFractionDigits: mb < 10 ? 1 : 0 }).format(mb);
  return `${n} MB`;
}
