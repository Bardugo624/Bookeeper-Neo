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

// ---- Setup: build, assemble, smoke test ----
const desktopJob = () => {
  const t = wf("release.yml");
  const i = t.indexOf("\n  desktop:");
  return t.slice(i, t.indexOf("\n  release:"));
};
const stepAt = (job, name) => {
  const i = job.indexOf(`- name: ${name}`);
  assert.ok(i >= 0, `no step ${name}`);
  return i;
};

test("release.yml: the light Setup is built and copied before Build, on Windows only", () => {
  const job = desktopJob();
  const i = stepAt(job, "Build the light Setup (windows)");
  assert.ok(i < stepAt(job, "Build\n"));
  const step = job.slice(i, stepAt(job, "DLL dependencies of the light Setup (windows)"));
  assert.match(step, /if: runner\.os == 'Windows'/);
  assert.match(step, /npm run tauri -w @bookeeper\/setup -- build --no-bundle --target "\$TARGET"/);
  assert.match(step, /apps\/desktop\/src-tauri\/windows\/bookeeper-setup\.exe/);
  assert.match(step, /::error::/);
  assert.match(job, /dumpbin/);
  assert.match(job, /vswhere/);
});

test("release.yml: assembly after Collect, then the smoke test with elevation allowed", () => {
  const job = desktopJob();
  const collect = stepAt(job, "Collect");
  const asm = stepAt(job, "Assemble the Setup (windows)");
  const smoke = stepAt(job, "Smoke test the Setup (windows)");
  assert.ok(collect < asm && asm < smoke);
  const a = job.slice(asm, smoke);
  assert.match(a, /runner\.os == 'Windows'/);
  assert.match(a, /scripts\/setup\/assemble\.mjs/);
  assert.match(a, /Bookeeper-Setup-\$\{VERSION\}\.exe/);
  assert.match(a, /nsis/);
  // The bundler puts the unpatched binary back in target/ after packaging: only the installer has the one it installs.
  assert.match(a, /7z e -y -o(\S+) "\$nsis" bookeeper-desktop\.exe/);
  assert.doesNotMatch(a, /release\/bookeeper-desktop\.exe/);
  assert.match(a, /--main "\$main"/);
  assert.match(a, /MAIN_EXE=\$\(pwd -W\)\/\$main/);
  const s = job.slice(smoke, job.indexOf("- uses: actions/upload-artifact@v4", smoke));
  assert.match(s, /BOOKEEPER_SETUP_ALLOW_ELEVATED: "1"/);
  assert.match(s, /scripts\/setup\/smoke\.ps1 -Setup .* -Classic .* -Main /);
});

test("release.yml: macOS DMG background", () => {
  const job = desktopJob();
  assert.match(job, /TAURI_BUNDLER_DMG_IGNORE_CI/);
  const tiff = stepAt(job, "Merge the DMG background");
  assert.ok(tiff < stepAt(job, "Build\n"));
  assert.match(job.slice(tiff), /tiffutil -cathidpicheck/);
  const build = job.slice(stepAt(job, "Build\n"), stepAt(job, "Collect"));
  const hits = build.match(/dmg\/background\.tiff/g) ?? [];
  assert.ok(hits.length >= 2, "TIFF must be in both branches");
  assert.match(build, /retrying once/);
  assert.match(build, /createUpdaterArtifacts/);
});

test("release.yml: the release carries Bookeeper-Setup-*", () => {
  const t = wf("release.yml");
  assert.match(t, /sha256sum [^\n]*Bookeeper-Setup-\*/);
  assert.match(t, /dist\/Bookeeper-Setup-\*/);
});

test("release.yml: check reads apps/setup/package.json", () => {
  const t = wf("release.yml");
  const check = t.slice(t.indexOf("  check:"), t.indexOf("  web:"));
  assert.match(check, /apps\/setup\/package\.json/);
});

test("ci.yml: the Windows job lints and tests the Setup crates", () => {
  const t = wf("ci.yml");
  const job = t.slice(t.indexOf("  desktop-build:"), t.indexOf("  docker:"));
  assert.match(job, /cargo clippy -p bookeeper-setup-core -p bookeeper-setup --all-targets -- -D warnings/);
  assert.match(job, /cargo test -p bookeeper-setup-core -p bookeeper-setup/);
});

test("smoke.ps1: six steps, odd folder, awaited processes", () => {
  const t = read("scripts/setup/smoke.ps1");
  assert.ok(t.includes("C:\\Prova Bookeeper\\Libreria è"));
  assert.match(t, /-Wait -PassThru/);
  for (let n = 1; n <= 6; n++) assert.match(t, new RegExp(`== ${n}\\. `));
  for (const s of ["--smoke-ui", "--quiet", "/P /UPDATE", "_?=", "--delete-data", "cmdkey", "UninstallString"]) {
    assert.ok(t.includes(s), s);
  }
  assert.match(t, /-ArgumentList \$arguments/);
});

test("smoke.ps1: a failure shows the end of the Setup log", () => {
  const t = read("scripts/setup/smoke.ps1");
  const name = /FILE_NAME: &str = "([^"]+)"/.exec(read("crates/bookeeper-setup-core/src/log.rs"))?.[1];
  assert.ok(name);
  assert.ok(t.includes(`Join-Path ([IO.Path]::GetTempPath()) '${name}'`));
  const fail = t.slice(t.indexOf("function Fail"), t.indexOf("function Expect"));
  assert.match(fail, /Get-Content -LiteralPath \$SetupLog -Tail \d+/);
});
