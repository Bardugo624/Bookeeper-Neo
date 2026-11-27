import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, test } from "node:test";
import { checkReady } from "./ready.mjs";

const servers = [];
async function serve(routes) {
  const s = createServer((req, res) => {
    const r = routes[req.url];
    if (r === undefined) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": "application/json" }).end(typeof r === "string" ? r : JSON.stringify(r));
  });
  await new Promise((ok) => s.listen(0, "127.0.0.1", ok));
  servers.push(s);
  return `http://127.0.0.1:${s.address().port}`;
}
after(() => servers.forEach((s) => s.close()));

const manifest = (version, host) => ({ version, platforms: { "windows-x86_64": { url: `${host}/files/${version}/a.exe`, signature: "s" } } });

async function setup({ r2 = {}, vps = {} }) {
  // The manifests need the R2 host in their URLs, so start the server with a late-bound table.
  const table = {};
  const base = await serve(table);
  for (const [k, v] of Object.entries(r2)) table[k] = typeof v === "function" ? v(base) : v;
  const vpsBase = await serve(vps);
  return { base, vps: vpsBase };
}

test("ready when both channels are there, current and reachable", async () => {
  const { base, vps } = await setup({
    r2: { "/stable/latest.json": (h) => manifest("2.1.0", h), "/beta/latest.json": (h) => manifest("2.2.0-beta.1", h), "/files/2.1.0/a.exe": "x", "/files/2.2.0-beta.1/a.exe": "x" },
    vps: { "/stable/latest.json": manifest("2.0.0", "http://x"), "/beta/latest.json": manifest("2.2.0-beta.1", "http://x") },
  });
  const r = await checkReady({ base, vps });
  assert.deepEqual(r, { ok: true, problems: [] });
});

test("not ready when the beta channel is missing", async () => {
  const { base, vps } = await setup({ r2: { "/stable/latest.json": (h) => manifest("2.1.0", h), "/files/2.1.0/a.exe": "x" } });
  const r = await checkReady({ base, vps });
  assert.equal(r.ok, false);
  assert.match(r.problems.join("\n"), /beta/);
});

test("not ready when stable is older than the VPS", async () => {
  const { base, vps } = await setup({
    r2: { "/stable/latest.json": (h) => manifest("2.0.0", h), "/beta/latest.json": (h) => manifest("2.2.0-beta.1", h), "/files/2.0.0/a.exe": "x", "/files/2.2.0-beta.1/a.exe": "x" },
    vps: { "/stable/latest.json": manifest("2.1.0", "http://x") },
  });
  const r = await checkReady({ base, vps });
  assert.equal(r.ok, false);
  assert.match(r.problems[0], /stable.*2\.0\.0.*2\.1\.0/);
});

test("not ready when a file answers 404", async () => {
  const { base, vps } = await setup({
    r2: { "/stable/latest.json": (h) => manifest("2.1.0", h), "/beta/latest.json": (h) => manifest("2.2.0-beta.1", h), "/files/2.1.0/a.exe": "x" },
  });
  const r = await checkReady({ base, vps });
  assert.equal(r.ok, false);
  assert.match(r.problems.join("\n"), /2\.2\.0-beta\.1\/a\.exe answers 404/);
});

import { test as t2 } from "node:test";
import assert2 from "node:assert/strict";
import { checkReady as cr } from "./ready.mjs";
t2("VPS failure is a problem, VPS 404 is not", async () => {
  const mk = (vpsStatus) => async (url) => {
    const r = (s, b) => ({ status: s, text: async () => b });
    if (url.startsWith("https://r2/")) {
      if (url.endsWith("latest.json")) return r(200, JSON.stringify({ version: "1.0.0", platforms: {} }));
    }
    return r(vpsStatus, "{}");
  };
  const bad = await cr({ base: "https://r2", vps: "https://vps", fetch: mk(500) });
  assert2.equal(bad.ok, false);
  const none = await cr({ base: "https://r2", vps: "https://vps", fetch: mk(404) });
  assert2.equal(none.ok, true);
});
