import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const wf = (n) => read(`.github/workflows/${n}`);

// The text of the top-level `on:` block.
function onBlock(text) {
  const m = text.match(/^on:\n((?: .*\n|\n)*)/m);
  assert.ok(m, "no on: block");
  return m[1];
}
const code = (text) => text.split("\n").filter((l) => !l.trim().startsWith("#"));

for (const name of ["vps-deploy.yml", "vps-ops.yml", "updates.yml"]) {
  test(`${name} only starts by hand`, () => {
    const on = onBlock(wf(name));
    assert.match(on, /workflow_dispatch/);
    assert.doesNotMatch(on, /\b(push|pull_request|pull_request_target|schedule)\b/);
  });
}

test("no vps-*.yml workflow has a push trigger", () => {
  for (const n of ["vps-deploy.yml", "vps-ops.yml"]) assert.doesNotMatch(onBlock(wf(n)), /\bpush\b/);
});

test("vps-deploy.yml: target, main only, ready before any ssh", () => {
  const t = wf("vps-deploy.yml");
  assert.match(t, /target:[\s\S]*options: \[server, caddy\]/);
  assert.match(t, /github\.ref != 'refs\/heads\/main'/);
  assert.match(t, /bookeeper-r2\.caddy/);
  const lines = code(t);
  const ready = lines.findIndex((l) => l.includes("updates-r2.mjs ready"));
  const ssh = lines.findIndex((l) => /\b(ssh|scp)\b/.test(l));
  assert.ok(ready >= 0, "no ready line");
  assert.ok(ssh >= 0 && ready < ssh, "ready must come before the first ssh/scp line");
  assert.match(lines[ready - 1] ?? "", /run:|if:|name:/);
});

test("updates.yml: group and main only", () => {
  const t = wf("updates.yml");
  assert.match(t, /group: publish-updates/);
  assert.match(t, /github\.ref != 'refs\/heads\/main'/);
  assert.match(t, /options: \[seed, withdraw\]/);
  assert.match(t, /options: \[stable, beta\]/);
});

test("release.yml: publishes to R2, VPS steps follow the vps output", () => {
  const t = wf("release.yml");
  assert.match(t, /updates-r2\.mjs publish/);
  const job = t.slice(t.indexOf("  publish-updates:"));
  assert.match(job, /UPDATES_REDIRECT" != on/);
  assert.match(job, /vps=true/);
  assert.doesNotMatch(job, /outputs\.go/);
  for (const n of ["SSH setup", "Manifest", "Upload the files, then the manifest"]) {
    const i = job.indexOf(`- name: ${n}`);
    assert.ok(i >= 0, n);
    assert.match(job.slice(i, i + 200), /steps\.gate\.outputs\.vps == 'true'/);
  }
});

test("run.sh writes nothing", () => {
  const lines = code(read("ops/vps/run.sh"));
  const bad = /(^|[\s;|&])(install|cp|mv|rm|tee)\s|systemctl\s+(reload|restart)|(^|[^-=\d])>{1,2}\s*[^&\s]/;
  for (const l of lines) {
    const stripped = l.replace(/'[^']*'/g, "''").replace(/%\{[^}]*\}/g, "");
    assert.doesNotMatch(stripped, bad, l);
  }
});

const site = (n) => read(`ops/vps/deploy/${n}`);
test("bookeeper-r2.caddy redirects updates and keeps the rest", () => {
  const r2 = site("bookeeper-r2.caddy");
  const block = r2.match(/handle_path \/updates\/\* \{\n([\s\S]*?)\n\t\}/);
  assert.ok(block);
  assert.ok(block[1].includes("redir https://updates.neokeeper.dev/v2{uri} 302"));
  const head = (t) => t.split("\n").find((l) => l.endsWith("{") && !l.includes("handle"));
  assert.equal(head(r2), head(site("bookeeper.caddy")));
  const rp = (t) => t.match(/reverse_proxy \S+/)[0];
  assert.equal(rp(r2), "reverse_proxy 127.0.0.1:7842");
  assert.equal(rp(r2), rp(site("bookeeper.caddy")));
});

const hasCaddy = spawnSync("caddy", ["version"], { encoding: "utf8" }).status === 0;
for (const n of ["bookeeper.caddy", "bookeeper-r2.caddy"]) {
  test(`caddy adapts ${n}`, { skip: hasCaddy ? false : "caddy is not on the PATH" }, () => {
    const dir = mkdtempSync(join(tmpdir(), "caddy-"));
    const f = join(dir, "Caddyfile");
    writeFileSync(f, site(n));
    const r = spawnSync("caddy", ["adapt", "--config", f, "--adapter", "caddyfile"], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  });
}
