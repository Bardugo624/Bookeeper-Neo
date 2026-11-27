import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "updates-r2.mjs");
const FAKE = join(here, "r2", "fake-aws.mjs");
const BASE = "https://updates.example.test/v2";
const SECRET = "s3cr3t-value-123";

let tmp;
before(() => {
  tmp = mkdtempSync(join(tmpdir(), "r2test-"));
  const bin = join(tmp, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "aws"), `#!/bin/sh\nexec "${process.execPath}" "${FAKE}" "$@"\n`);
  chmodSync(join(bin, "aws"), 0o755);
});
after(() => rmSync(tmp, { recursive: true, force: true }));

let n = 0;
function world() {
  const root = join(tmp, `w${n++}`);
  const w = { root, bucket: join(root, "bucket"), log: join(root, "log.jsonl") };
  mkdirSync(w.bucket, { recursive: true });
  writeFileSync(w.log, "");
  w.env = {
    PATH: `${join(tmp, "bin")}:${process.env.PATH}`,
    FAKE_AWS_DIR: w.bucket,
    FAKE_AWS_LOG: w.log,
    R2_ACCOUNT_ID: "acct1",
    R2_BUCKET: "bk",
    AWS_ACCESS_KEY_ID: "AKIAFAKE",
    AWS_SECRET_ACCESS_KEY: SECRET,
  };
  return w;
}
const calls = (w) => readFileSync(w.log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const puts = (w) => calls(w).filter((c) => c.op === "put");
const keys = (w, dir = join(w.bucket, "bk")) =>
  existsSync(dir) ? readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name).slice(dir.length + 1)).sort() : [];
const read = (w, key) => JSON.parse(readFileSync(join(w.bucket, "bk", key), "utf8"));
const snapshot = (w) => Object.fromEntries(keys(w).map((k) => [k, readFileSync(join(w.bucket, "bk", k), "utf8")]));
const run = (w, args, env = w.env) => spawnSync(process.execPath, [CLI, ...args], { env, encoding: "utf8" });

function release(w, version) {
  const up = join(w.root, `up-${version}`);
  const inst = join(w.root, `inst-${version}`);
  mkdirSync(up, { recursive: true });
  mkdirSync(inst, { recursive: true });
  writeFileSync(join(up, "Bookeeper_x64-setup.exe"), `exe-${version}`);
  writeFileSync(join(up, "Bookeeper_x64-setup.exe.sig"), `sig-${version}\n`);
  writeFileSync(join(inst, "Bookeeper_x64-setup.exe"), `exe-${version}`);
  writeFileSync(join(inst, "Bookeeper_aarch64.dmg"), `dmg-${version}`);
  writeFileSync(join(inst, "bookeeper_amd64.deb"), `deb-${version}`);
  writeFileSync(join(w.root, "notes.md"), "notes");
  return ["publish", "--version", version, "--updates", up, "--installers", inst, "--notes-file", join(w.root, "notes.md"), "--base", BASE];
}

test("publish on an empty bucket: right keys, cache, types, files before manifests", () => {
  const w = world();
  const r = run(w, release(w, "2.1.0"));
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(keys(w), [
    "v2/beta/latest.json", "v2/downloads/2.1.0/Bookeeper_aarch64.dmg", "v2/downloads/2.1.0/Bookeeper_x64-setup.exe",
    "v2/downloads/2.1.0/bookeeper_amd64.deb", "v2/downloads/stable.json", "v2/files/2.1.0/Bookeeper_x64-setup.exe",
    "v2/files/2.1.0/Bookeeper_x64-setup.exe.sig", "v2/files/2.1.0/manifest.json", "v2/stable/latest.json",
  ]);
  const order = puts(w).map((c) => c.key);
  const first = (k) => order.indexOf(k);
  assert.ok(first("v2/files/2.1.0/Bookeeper_x64-setup.exe.sig") < first("v2/files/2.1.0/manifest.json"));
  assert.ok(first("v2/downloads/2.1.0/bookeeper_amd64.deb") < first("v2/stable/latest.json"));
  assert.equal(order.at(-1), "v2/downloads/stable.json");
  const by = Object.fromEntries(puts(w).map((c) => [c.key, c]));
  assert.equal(by["v2/stable/latest.json"].cache, "no-cache");
  assert.equal(by["v2/stable/latest.json"].type, "application/json");
  assert.equal(by["v2/files/2.1.0/Bookeeper_x64-setup.exe.sig"].type, "text/plain");
  assert.equal(by["v2/files/2.1.0/Bookeeper_x64-setup.exe"].cache, "public, max-age=31536000, immutable");
  assert.equal(by["v2/downloads/2.1.0/Bookeeper_aarch64.dmg"].type, "application/x-apple-diskimage");
  assert.equal(by["v2/downloads/2.1.0/bookeeper_amd64.deb"].type, "application/vnd.debian.binary-package");
  const p = puts(w)[0];
  assert.equal(p.endpoint, "https://acct1.r2.cloudflarestorage.com");
  assert.deepEqual([p.region, p.reqChecksum, p.resChecksum], ["auto", "when_required", "when_required"]);
  const m = read(w, "v2/stable/latest.json");
  assert.equal(m.platforms["windows-x86_64"].url, `${BASE}/files/2.1.0/Bookeeper_x64-setup.exe`);
  const idx = read(w, "v2/downloads/stable.json");
  assert.equal(idx.version, "2.1.0");
  assert.deepEqual(Object.keys(idx.files).sort(), ["darwin-aarch64", "linux-x86_64-deb", "windows-x86_64"]);
  assert.equal(idx.files["linux-x86_64-deb"], `${BASE}/downloads/2.1.0/bookeeper_amd64.deb`);
  assert.equal(r.stdout.includes(SECRET) || r.stderr.includes(SECRET), false);
});

test("a second identical publish leaves the bucket as it was", () => {
  const w = world();
  const args = release(w, "2.1.0");
  assert.equal(run(w, args).status, 0);
  const before = snapshot(w);
  const r = run(w, args);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(snapshot(w), before);
});

test("an older version does not replace the channel manifest", () => {
  const w = world();
  assert.equal(run(w, release(w, "2.2.0")).status, 0);
  const r = run(w, release(w, "2.1.0"));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /keeping the newer manifest/);
  assert.equal(read(w, "v2/stable/latest.json").version, "2.2.0");
  assert.equal(read(w, "v2/downloads/stable.json").version, "2.2.0");
  assert.ok(keys(w).includes("v2/files/2.1.0/manifest.json"));
});

test("a beta never replaces a stable of the same number, and stable also moves beta", () => {
  const w = world();
  assert.equal(run(w, release(w, "2.2.0")).status, 0);
  assert.equal(read(w, "v2/beta/latest.json").version, "2.2.0");
  assert.equal(run(w, release(w, "2.2.0-beta.1")).status, 0);
  assert.equal(read(w, "v2/beta/latest.json").version, "2.2.0");
  assert.equal(read(w, "v2/stable/latest.json").version, "2.2.0");
});

test("cleanup keeps the newest three, the pointed ones and the new one", () => {
  const w = world();
  for (const v of ["2.8.0", "2.9.0", "2.10.0", "2.11.0"]) assert.equal(run(w, release(w, v)).status, 0);
  const versions = (dir) => [...new Set(keys(w).filter((k) => k.startsWith(`v2/${dir}/`)).map((k) => k.split("/")[2]).filter((s) => /^\d/.test(s)))];
  assert.deepEqual(versions("files").sort(), ["2.10.0", "2.11.0", "2.9.0"]);
  assert.deepEqual(versions("downloads").sort(), ["2.10.0", "2.11.0", "2.9.0"]);
  // an older release is still kept while published, but older pointers are protected too
  assert.equal(run(w, release(w, "2.8.0")).status, 0);
  assert.ok(keys(w).includes("v2/files/2.8.0/manifest.json"));
});

test("without variables: exit 2 naming them, never values; dry-run works", () => {
  const w = world();
  const env = { PATH: w.env.PATH, FAKE_AWS_DIR: w.bucket, FAKE_AWS_LOG: w.log, AWS_SECRET_ACCESS_KEY: SECRET };
  const r = run(w, release(w, "2.1.0"), env);
  assert.equal(r.status, 2);
  for (const name of ["R2_ACCOUNT_ID", "R2_BUCKET", "AWS_ACCESS_KEY_ID"]) assert.match(r.stderr, new RegExp(name));
  assert.doesNotMatch(r.stderr, /AWS_SECRET_ACCESS_KEY/);
  assert.equal((r.stdout + r.stderr).includes(SECRET), false);
  assert.equal(calls(w).length, 0);
  const d = run(w, [...release(w, "2.1.0"), "--dry-run"], { PATH: w.env.PATH });
  assert.equal(d.status, 0, d.stderr);
  assert.match(d.stdout, /\[dry-run\] would upload v2\/stable\/latest\.json/);
  assert.equal(calls(w).length, 0);
});

test("dry-run with variables reads but never writes", () => {
  const w = world();
  const d = run(w, [...release(w, "2.1.0"), "--dry-run"]);
  assert.equal(d.status, 0, d.stderr);
  assert.equal(puts(w).length, 0);
  assert.deepEqual(keys(w), []);
});

test("withdraw points the channel back to a version's manifest", () => {
  const w = world();
  assert.equal(run(w, release(w, "2.1.0")).status, 0);
  assert.equal(run(w, release(w, "2.2.0")).status, 0);
  const r = run(w, ["withdraw", "--channel", "stable", "--version", "2.1.0", "--base", BASE]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /2\.2\.0 -> 2\.1\.0/);
  assert.equal(read(w, "v2/stable/latest.json").version, "2.1.0");
  const bad = run(w, ["withdraw", "--channel", "stable", "--version", "9.9.9", "--base", BASE]);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /9\.9\.9/);
});

test("seed copies the VPS tree to R2 with rewritten URLs", () => {
  const w = world();
  const from = join(w.root, "vps");
  const vpsBase = "https://app.example.test/updates";
  const man = (v) => ({ version: v, notes: "", pub_date: "d", platforms: { "windows-x86_64": { signature: "sig", url: `${vpsBase}/files/${v}/a.exe` } } });
  for (const [c, v] of [["stable", "2.1.0"], ["beta", "2.2.0-beta.1"]]) {
    mkdirSync(join(from, c), { recursive: true });
    writeFileSync(join(from, c, "latest.json"), JSON.stringify(man(v)));
    mkdirSync(join(from, "files", v), { recursive: true });
    writeFileSync(join(from, "files", v, "a.exe"), `exe-${v}`);
    writeFileSync(join(from, "files", v, "a.exe.sig"), "sig");
  }
  const r = run(w, ["seed", "--from", from, "--from-base", vpsBase, "--base", BASE]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(read(w, "v2/stable/latest.json").platforms["windows-x86_64"].url, `${BASE}/files/2.1.0/a.exe`);
  assert.equal(read(w, "v2/files/2.2.0-beta.1/manifest.json").version, "2.2.0-beta.1");
  assert.ok(keys(w).includes("v2/files/2.1.0/a.exe.sig"));
  // a foreign URL is an error
  writeFileSync(join(from, "beta", "latest.json"), JSON.stringify({ ...man("2.2.0-beta.1"), platforms: { w: { url: "https://evil.test/x", signature: "s" } } }));
  const bad = run(world(), ["seed", "--from", from, "--from-base", vpsBase, "--base", BASE]);
  assert.equal(bad.status, 1);
});
