// Pure decisions for the R2 publisher: keys, content types, "newer wins", what to keep.
import { channelOf, platformOf } from "../update-manifest.mjs";
import { compare } from "../semver.mjs";

export { channelOf, platformOf };

export const NO_CACHE = "no-cache";
export const IMMUTABLE = "public, max-age=31536000, immutable";
export const KEEP_RECENT = 3;

/** `https://updates.neokeeper.dev/v2` → `v2/`; a base without path → ``. */
export function keyPrefix(base) {
  const path = new URL(base).pathname.replace(/^\/+|\/+$/g, "");
  return path ? `${path}/` : "";
}

export const trimBase = (base) => base.replace(/\/+$/, "");

const TYPES = [
  [".tar.gz", "application/gzip"],
  [".json", "application/json"],
  [".sig", "text/plain"],
  [".exe", "application/vnd.microsoft.portable-executable"],
  [".dmg", "application/x-apple-diskimage"],
  [".deb", "application/vnd.debian.binary-package"],
];

export function contentType(name) {
  const n = name.toLowerCase();
  const hit = TYPES.find(([ext]) => n.endsWith(ext));
  return hit ? hit[1] : "application/octet-stream";
}

/** Manifests and indexes change; everything else under a version never does. */
export function cacheControl(key) {
  if (/(^|\/)(latest|manifest)\.json$/.test(key)) return NO_CACHE;
  if (/(^|\/)downloads\/[^/]+\.json$/.test(key)) return NO_CACHE;
  return IMMUTABLE;
}

/** A pointer moves forward (or stays): absent, equal or older current version is replaced. */
export function shouldReplace(current, incoming) {
  if (!current) return true;
  return compare(incoming, current) >= 0;
}

/** Channels whose manifest a release of `version` may write. */
export function manifestChannels(version) {
  return channelOf(version) === "stable" ? ["stable", "beta"] : ["beta"];
}

/** The installer platform keys of the downloads index. */
export function installerPlatform(name) {
  const n = name.toLowerCase();
  const arm = /(aarch64|arm64)/.test(n);
  const x64 = /(x86_64|x64|amd64)/.test(n);
  if (n.endsWith(".exe")) return arm ? null : "windows-x86_64";
  if (n.endsWith(".dmg")) return arm ? "darwin-aarch64" : x64 ? "darwin-x86_64" : null;
  if (n.endsWith(".appimage")) return arm ? null : "linux-x86_64-appimage";
  if (n.endsWith(".deb")) return arm ? null : "linux-x86_64-deb";
  return null;
}

export function buildIndex({ version, pubDate, installers, base }) {
  const root = trimBase(base);
  const files = {};
  // The Setup is the Windows download; the classic NSIS installer is the fallback.
  const isSetup = (n) => /^Bookeeper-Setup-.*\.exe$/i.test(n);
  const ordered = [...installers].sort((a, b) => Number(isSetup(b)) - Number(isSetup(a)) || (a < b ? -1 : a > b ? 1 : 0));
  for (const name of ordered) {
    const platform = installerPlatform(name);
    if (!platform || files[platform]) continue;
    files[platform] = `${root}/downloads/${encodeURIComponent(version)}/${encodeURIComponent(name)}`;
  }
  return { version, pub_date: pubDate, files };
}

const isVersion = (v) => {
  try {
    compare(v, v);
    return true;
  } catch {
    return false;
  }
};

/** `files/2.1.0/a.exe` under `<prefix>files/` → `2.1.0`; null for keys outside a version folder. */
export function versionOfKey(key, prefix, section) {
  const head = `${prefix}${section}/`;
  if (!key.startsWith(head)) return null;
  const parts = key.slice(head.length).split("/");
  if (parts.length < 2 || !isVersion(parts[0])) return null;
  return parts[0];
}

/** Versions to keep: the newest few (by SemVer), those pointed at, and the one just published. */
export function versionsToKeep({ present, pointed = [], published, recent = KEEP_RECENT }) {
  const all = [...new Set([...present, published])].filter(isVersion);
  all.sort((a, b) => compare(b, a));
  return new Set([...all.slice(0, recent), ...pointed.filter(Boolean), published]);
}

/** Keys under `files/` and `downloads/` whose version is not kept. */
export function keysToDelete({ keys, prefix, keep }) {
  return keys.filter((key) => {
    for (const section of ["files", "downloads"]) {
      const v = versionOfKey(key, prefix, section);
      if (v) return !keep.has(v);
    }
    return false;
  });
}

/** Rewrites every platform URL from `fromBase` to `base`. A foreign URL is an error. */
export function rewriteManifest(manifest, fromBase, base) {
  const from = `${trimBase(fromBase)}/`;
  const to = trimBase(base);
  const platforms = {};
  for (const [name, entry] of Object.entries(manifest.platforms ?? {})) {
    if (typeof entry.url !== "string" || !entry.url.startsWith(from)) {
      throw new Error(`${name}: URL ${entry.url} does not start with ${trimBase(fromBase)}`);
    }
    platforms[name] = { ...entry, url: `${to}/${entry.url.slice(from.length)}` };
  }
  return { ...manifest, platforms };
}

/** The key (without prefix) a rewritten URL stands for, e.g. `files/2.1.0/a.exe`. */
export function relativeKey(url, base) {
  const rest = url.slice(`${trimBase(base)}/`.length).split("?")[0];
  return rest.split("/").map(decodeURIComponent).join("/");
}
