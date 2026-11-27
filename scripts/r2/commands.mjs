// publish / seed / withdraw on top of the bucket and the pure plan.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildManifest } from "../update-manifest.mjs";
import {
  buildIndex, channelOf, keyPrefix, keysToDelete, manifestChannels, relativeKey,
  rewriteManifest, shouldReplace, versionsToKeep,
} from "./plan.mjs";

const json = (o) => `${JSON.stringify(o, null, 2)}\n`;
const filesIn = (dir) => readdirSync(dir).sort().filter((n) => statSync(join(dir, n)).isFile());

async function readJsonKey(bucket, key) {
  const text = await bucket.get(key);
  return text === null ? null : JSON.parse(text);
}

/** Writes a pointer (channel manifest or index) unless the bucket already has a newer one. */
async function movePointer(bucket, key, doc, log) {
  const current = await readJsonKey(bucket, key);
  if (!shouldReplace(current?.version, doc.version)) {
    log(`keeping the newer manifest in ${key} (${current.version})`);
    return;
  }
  await bucket.putText(json(doc), key);
}

async function cleanup({ bucket, prefix, version, log }) {
  const keys = [...(await bucket.list(`${prefix}files/`)), ...(await bucket.list(`${prefix}downloads/`))];
  const present = new Set();
  for (const k of keys) {
    const m = /^(?:files|downloads)\/([^/]+)\//.exec(k.slice(prefix.length));
    if (m) present.add(m[1]);
  }
  const pointed = [];
  for (const c of ["stable", "beta"]) {
    pointed.push((await readJsonKey(bucket, `${prefix}${c}/latest.json`))?.version);
    pointed.push((await readJsonKey(bucket, `${prefix}downloads/${c}.json`))?.version);
  }
  const keep = versionsToKeep({ present: [...present], pointed, published: version });
  const doomed = keysToDelete({ keys, prefix, keep });
  for (const key of doomed) await bucket.remove(key);
  log(`cleanup: keeping ${[...keep].join(", ")}; ${doomed.length} object(s) removed`);
}

export async function publish({ bucket, base, version, updates, installers, notesFile, log = console.log }) {
  const prefix = keyPrefix(base);
  const channel = channelOf(version);
  const manifestKey = `${prefix}files/${version}/manifest.json`;

  // A republish keeps the manifest already in the bucket, so pub_date and the bytes stay the same.
  const existing = await readJsonKey(bucket, manifestKey);
  const manifest = existing ?? buildManifest({
    dir: updates, version, notes: notesFile ? readFileSync(notesFile, "utf8") : "", baseUrl: base,
    warn: (m) => log(`warning: ${m}`),
  });

  for (const name of filesIn(updates)) await bucket.put(join(updates, name), `${prefix}files/${version}/${name}`);
  await bucket.putText(json(manifest), manifestKey);

  const installerNames = filesIn(installers);
  for (const name of installerNames) await bucket.put(join(installers, name), `${prefix}downloads/${version}/${name}`);

  for (const c of manifestChannels(version)) await movePointer(bucket, `${prefix}${c}/latest.json`, manifest, log);
  const index = buildIndex({ version, pubDate: manifest.pub_date, installers: installerNames, base });
  await movePointer(bucket, `${prefix}downloads/${channel}.json`, index, log);

  await cleanup({ bucket, prefix, version, log });
}

export async function seed({ bucket, from, fromBase, base, log = console.log }) {
  const prefix = keyPrefix(base);
  const byChannel = [];
  for (const channel of ["stable", "beta"]) {
    const file = join(from, channel, "latest.json");
    if (!existsSync(file)) {
      log(`warning: ${file} not found, ${channel} skipped`);
      continue;
    }
    byChannel.push([channel, rewriteManifest(JSON.parse(readFileSync(file, "utf8")), fromBase, base)]);
  }
  const manifests = byChannel.map(([, m]) => m);
  if (!byChannel.length) throw new Error(`no channel manifest in ${from}`);

  const seen = new Set();
  const uploads = [];
  for (const m of manifests) {
    for (const p of Object.values(m.platforms)) {
      const rel = relativeKey(p.url, base);
      for (const r of [rel, `${rel}.sig`]) {
        const file = join(from, ...r.split("/"));
        if (seen.has(r)) continue;
        if (!existsSync(file)) {
          if (r === rel) throw new Error(`${r} is not in ${from}`);
          continue;
        }
        seen.add(r);
        uploads.push([file, `${prefix}${r}`]);
      }
    }
  }
  for (const [file, key] of uploads) await bucket.put(file, key);
  const versions = new Set();
  for (const m of manifests) {
    if (versions.has(m.version)) continue;
    versions.add(m.version);
    await bucket.putText(json(m), `${prefix}files/${m.version}/manifest.json`);
  }
  for (const [channel, m] of byChannel) await movePointer(bucket, `${prefix}${channel}/latest.json`, m, log);
}

export async function withdraw({ bucket, base, channel, version, log = console.log }) {
  const prefix = keyPrefix(base);
  const text = await bucket.get(`${prefix}files/${version}/manifest.json`);
  if (text === null) throw new Error(`version ${version} has no manifest.json in the bucket`);
  const key = `${prefix}${channel}/latest.json`;
  const before = (await readJsonKey(bucket, key))?.version ?? "none";
  await bucket.putText(text, key);
  log(`withdraw ${channel}: ${before} -> ${version}`);
}
