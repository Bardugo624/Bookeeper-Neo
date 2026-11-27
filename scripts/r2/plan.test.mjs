import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildIndex, cacheControl, contentType, installerPlatform, keyPrefix, keysToDelete,
  relativeKey, rewriteManifest, shouldReplace, versionsToKeep,
} from "./plan.mjs";

test("keyPrefix comes from the base path", () => {
  assert.equal(keyPrefix("https://updates.neokeeper.dev/v2"), "v2/");
  assert.equal(keyPrefix("https://updates.neokeeper.dev/v2/"), "v2/");
  assert.equal(keyPrefix("https://updates.neokeeper.dev"), "");
});

test("content types and cache", () => {
  assert.equal(contentType("a.app.tar.gz"), "application/gzip");
  assert.equal(contentType("x.AppImage"), "application/octet-stream");
  assert.equal(contentType("a.exe.sig"), "text/plain");
  assert.equal(cacheControl("v2/stable/latest.json"), "no-cache");
  assert.equal(cacheControl("v2/files/1.0.0/manifest.json"), "no-cache");
  assert.equal(cacheControl("v2/downloads/stable.json"), "no-cache");
  assert.match(cacheControl("v2/downloads/1.0.0/a.exe"), /immutable/);
  assert.match(cacheControl("v2/files/1.0.0/a.exe.sig"), /max-age=31536000/);
});

test("a pointer is replaced when absent, equal or older", () => {
  assert.equal(shouldReplace(undefined, "1.0.0"), true);
  assert.equal(shouldReplace("1.0.0", "1.0.0"), true);
  assert.equal(shouldReplace("1.0.0", "1.1.0"), true);
  assert.equal(shouldReplace("2.2.0", "2.2.0-beta.1"), false);
  assert.equal(shouldReplace("2.10.0", "2.9.0"), false);
});

test("keep the newest three, the pointed ones and the published one", () => {
  const present = ["2.9.0", "2.10.0", "2.8.0", "2.7.0", "2.1.0", "2.11.0-beta.1"];
  const keep = versionsToKeep({ present, pointed: ["2.1.0", undefined], published: "2.10.0" });
  assert.deepEqual([...keep].sort(), ["2.1.0", "2.10.0", "2.11.0-beta.1", "2.9.0"].sort());
  const five = versionsToKeep({ present: ["3.0.0", "3.1.0", "3.2.0", "3.3.0", "3.4.0"], pointed: [], published: "3.4.0" });
  assert.deepEqual([...five].sort(), ["3.2.0", "3.3.0", "3.4.0"]);
});

test("keysToDelete only touches versioned keys outside the keep set", () => {
  const keys = ["v2/files/1.0.0/a", "v2/files/2.0.0/a", "v2/downloads/1.0.0/i.exe", "v2/downloads/stable.json", "v2/stable/latest.json"];
  assert.deepEqual(keysToDelete({ keys, prefix: "v2/", keep: new Set(["2.0.0"]) }), ["v2/files/1.0.0/a", "v2/downloads/1.0.0/i.exe"]);
});

test("installer platforms are read from the file name", () => {
  const f = installerPlatform;
  assert.equal(f("Bookeeper_2.1.0_x64-setup.exe"), "windows-x86_64");
  assert.equal(f("Bookeeper_2.1.0_aarch64.dmg"), "darwin-aarch64");
  assert.equal(f("Bookeeper_2.1.0_x64.dmg"), "darwin-x86_64");
  assert.equal(f("Bookeeper_2.1.0_amd64.AppImage"), "linux-x86_64-appimage");
  assert.equal(f("bookeeper_2.1.0_amd64.deb"), "linux-x86_64-deb");
  assert.equal(f("bookeeper-server.tar.gz"), null);
  const idx = buildIndex({ version: "2.1.0", pubDate: "d", installers: ["a_x64.dmg", "notes.txt"], base: "https://h/v2/" });
  assert.deepEqual(idx, { version: "2.1.0", pub_date: "d", files: { "darwin-x86_64": "https://h/v2/downloads/2.1.0/a_x64.dmg" } });
});

test("seed rewrites URLs to the new base and rejects foreign ones", () => {
  const m = { version: "2.0.0", platforms: { "windows-x86_64": { signature: "s", url: "https://app/updates/files/2.0.0/a%20b.exe" } } };
  const out = rewriteManifest(m, "https://app/updates/", "https://u/v2");
  assert.equal(out.platforms["windows-x86_64"].url, "https://u/v2/files/2.0.0/a%20b.exe");
  assert.equal(relativeKey(out.platforms["windows-x86_64"].url, "https://u/v2"), "files/2.0.0/a b.exe");
  assert.throws(() => rewriteManifest({ platforms: { w: { url: "https://evil/x" } } }, "https://app/updates", "https://u/v2"), /does not start with/);
});
