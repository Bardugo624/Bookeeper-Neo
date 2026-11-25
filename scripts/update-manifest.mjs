#!/usr/bin/env node
// Writes `latest.json` in the Tauri v2 updater format from a folder of update artifacts.
//
//   node scripts/update-manifest.mjs --dir <artifacts> --version <v> --base-url <url>
//        [--notes <text> | --notes-file <file>] [--out <file>]
//
// Each artifact is `<file>` plus `<file>.sig`. Platforms are recognised from the file name.
// A platform without a signature is left out with a warning; no platform at all is an error.
// Stdout carries the channel (`stable` or `beta`), everything else goes to stderr.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** `2.0.0-beta.1` → beta, `2.0.0` → stable. */
export function channelOf(version) {
  return version.includes("-") ? "beta" : "stable";
}

/** The Tauri platform key for an update artifact name, or null if it is not one. */
export function platformOf(name) {
  const n = name.toLowerCase();
  const arm = /(aarch64|arm64)/.test(n);
  const x64 = /(x86_64|x64|amd64)/.test(n);
  if (n.endsWith(".app.tar.gz")) {
    if (arm) return "darwin-aarch64";
    if (x64) return "darwin-x86_64";
    return null;
  }
  if (n.endsWith(".appimage") || n.endsWith(".appimage.tar.gz")) {
    return arm ? null : "linux-x86_64";
  }
  if (n.endsWith(".exe")) return arm ? null : "windows-x86_64";
  return null;
}

/** Builds the manifest. `warn` receives one message per skipped platform. */
export function buildManifest({ dir, version, notes, baseUrl, now = new Date(), warn = () => {} }) {
  const base = baseUrl.replace(/\/+$/, "");
  const platforms = {};
  for (const name of readdirSync(dir).sort()) {
    if (name.endsWith(".sig")) continue;
    const platform = platformOf(name);
    if (!platform) continue;
    if (platforms[platform]) {
      warn(`${name}: ${platform} already has an artifact, ignored`);
      continue;
    }
    const sigPath = join(dir, `${name}.sig`);
    if (!existsSync(sigPath)) {
      warn(`${platform}: ${name} has no signature, platform left out`);
      continue;
    }
    platforms[platform] = {
      signature: readFileSync(sigPath, "utf8").trim(),
      url: `${base}/files/${encodeURIComponent(version)}/${encodeURIComponent(name)}`,
    };
  }
  if (Object.keys(platforms).length === 0) {
    throw new Error(`no signed update artifact found in ${dir}`);
  }
  return { version, notes, pub_date: now.toISOString(), platforms };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i];
    if (!k.startsWith("--") || i + 1 >= argv.length) throw new Error(`bad argument: ${k}`);
    out[k.slice(2)] = argv[i + 1];
  }
  return out;
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  for (const k of ["dir", "version", "base-url"]) {
    if (!a[k]) throw new Error(`missing --${k}`);
  }
  const notes = a["notes-file"] ? readFileSync(a["notes-file"], "utf8") : (a.notes ?? "");
  const manifest = buildManifest({
    dir: a.dir,
    version: a.version,
    notes,
    baseUrl: a["base-url"],
    warn: (m) => console.error(`::warning::${m}`),
  });
  const out = a.out ?? join(a.dir, "latest.json");
  writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
  console.error(`wrote ${out} (${Object.keys(manifest.platforms).join(", ")})`);
  console.log(channelOf(a.version));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(`::error::${e.message}`);
    process.exit(1);
  }
}
