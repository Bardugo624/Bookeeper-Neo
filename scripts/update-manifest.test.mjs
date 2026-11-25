import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildManifest, channelOf } from "./update-manifest.mjs";

const script = fileURLToPath(new URL("./update-manifest.mjs", import.meta.url));
const BASE = "https://example.test/updates";
const FILES = [
  "Bookeeper_2.0.0_x64-setup.exe",
  "Bookeeper_2.0.0_aarch64.app.tar.gz",
  "Bookeeper_2.0.0_x64.app.tar.gz",
  "Bookeeper_2.0.0_amd64.AppImage",
];

function folder(files, unsigned = []) {
  const dir = mkdtempSync(join(tmpdir(), "manifest-"));
  for (const f of files) {
    writeFileSync(join(dir, f), "bin");
    if (!unsigned.includes(f)) writeFileSync(join(dir, `${f}.sig`), `sig-of-${f}\n`);
  }
  // installers are not update artifacts
  writeFileSync(join(dir, "Bookeeper_2.0.0_aarch64.dmg"), "dmg");
  return dir;
}

test("complete manifest from the four artifacts", () => {
  const m = buildManifest({ dir: folder(FILES), version: "2.0.0", notes: "n", baseUrl: BASE });
  assert.equal(m.version, "2.0.0");
  assert.deepEqual(Object.keys(m.platforms).sort(), [
    "darwin-aarch64",
    "darwin-x86_64",
    "linux-x86_64",
    "windows-x86_64",
  ]);
  assert.equal(m.platforms["darwin-aarch64"].signature, "sig-of-Bookeeper_2.0.0_aarch64.app.tar.gz");
  assert.equal(m.platforms["windows-x86_64"].signature, "sig-of-Bookeeper_2.0.0_x64-setup.exe");
  assert.ok(!Number.isNaN(Date.parse(m.pub_date)));
});

test("a platform without signature is omitted with a warning", () => {
  const warnings = [];
  const m = buildManifest({
    dir: folder(FILES, ["Bookeeper_2.0.0_amd64.AppImage"]),
    version: "2.0.0",
    notes: "",
    baseUrl: BASE,
    warn: (w) => warnings.push(w),
  });
  assert.equal(m.platforms["linux-x86_64"], undefined);
  assert.equal(Object.keys(m.platforms).length, 3);
  assert.equal(warnings.length, 1);
});

test("no platform exits non-zero", () => {
  const dir = folder([]);
  const r = spawnSync(process.execPath, [script, "--dir", dir, "--version", "2.0.0", "--base-url", BASE]);
  assert.notEqual(r.status, 0);
  const unsigned = folder(FILES.slice(0, 1), FILES.slice(0, 1));
  const r2 = spawnSync(process.execPath, [script, "--dir", unsigned, "--version", "2.0.0", "--base-url", BASE]);
  assert.notEqual(r2.status, 0);
});

test("channel comes from the version suffix", () => {
  assert.equal(channelOf("2.0.0-beta.1"), "beta");
  assert.equal(channelOf("2.0.0"), "stable");
});

test("urls use the base and the version in the path", () => {
  const m = buildManifest({ dir: folder(FILES), version: "2.0.0", notes: "", baseUrl: `${BASE}/` });
  assert.equal(
    m.platforms["windows-x86_64"].url,
    `${BASE}/files/2.0.0/Bookeeper_2.0.0_x64-setup.exe`,
  );
  for (const p of Object.values(m.platforms)) assert.ok(p.url.startsWith(`${BASE}/files/2.0.0/`));
});

test("notes with newlines and quotes survive the JSON file", () => {
  const dir = folder(FILES);
  const notes = 'Line one\nLine "two"\n\n- item \\ back';
  const r = spawnSync(process.execPath, [
    script, "--dir", dir, "--version", "2.0.0-beta.1", "--base-url", BASE, "--notes", notes,
  ]);
  assert.equal(r.status, 0, r.stderr.toString());
  assert.equal(r.stdout.toString().trim(), "beta");
  const m = JSON.parse(readFileSync(join(dir, "latest.json"), "utf8"));
  assert.equal(m.notes, notes);
  assert.ok(m.platforms["linux-x86_64"].url.includes("/files/2.0.0-beta.1/"));
});
