import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { assemble, readTail } from './assemble.mjs';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const script = fileURLToPath(new URL('./assemble.mjs', import.meta.url));

function fixtures() {
  const dir = mkdtempSync(join(tmpdir(), 'bk-assemble-'));
  const files = {
    setup: Buffer.from('MZ-setup-'.repeat(50)),
    payload: Buffer.from('nsis-installer-'.repeat(200)),
    main: Buffer.from('desktop-exe-'.repeat(120)),
  };
  const paths = {
    setup: join(dir, 'bookeeper-setup.exe'),
    payload: join(dir, 'Bookeeper_2.2.0_x64-setup.exe'),
    main: join(dir, 'bookeeper-desktop.exe'),
    out: join(dir, 'Bookeeper-Setup-2.2.0.exe'),
  };
  for (const k of Object.keys(files)) writeFileSync(paths[k], files[k]);
  return { files, paths };
}

test('assembled file ends with a tail readTail understands', async () => {
  const { files, paths } = fixtures();
  const res = await assemble({ ...paths, version: '2.2.0' });
  const out = readFileSync(paths.out);
  assert.equal(res.sha256, sha(out));
  assert.ok(out.subarray(0, files.setup.length).equals(files.setup));
  assert.ok(out.subarray(files.setup.length, files.setup.length + files.payload.length).equals(files.payload));
  const { meta, payloadLen } = readTail(out);
  assert.equal(payloadLen, files.payload.length);
  assert.equal(meta.version, '2.2.0');
  assert.equal(meta.payload.name, 'Bookeeper_2.2.0_x64-setup.exe');
  assert.equal(meta.payload.sha256, sha(files.payload));
  assert.equal(meta.main.name, 'bookeeper-desktop.exe');
  assert.equal(meta.main.sha256, sha(files.main));
  assert.equal(meta.main.bytes, files.main.length);
  assert.equal(meta.installed_bytes, files.main.length + files.setup.length);
});

test('readTail reads the Rust fixture', () => {
  const buf = readFileSync(new URL('../../crates/bookeeper-setup-core/tests/fixtures/tail.bin', import.meta.url));
  const { meta, payloadLen } = readTail(buf);
  assert.equal(meta.version, '2.2.0');
  assert.equal(payloadLen, 1234);
  assert.equal(meta.main.bytes, 4096);
  assert.equal(meta.installed_bytes, 41000000);
});

test('readTail returns null without a tail', () => {
  assert.equal(readTail(Buffer.from('nothing here, just bytes of padding')), null);
});

test('CLI exits 2 on missing arguments, bad version or missing files', () => {
  const { paths } = fixtures();
  const run = (args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  const full = ['--setup', paths.setup, '--payload', paths.payload, '--main', paths.main, '--out', paths.out];
  const noArgs = run([]);
  assert.equal(noArgs.status, 2);
  const noVersion = run(full);
  assert.equal(noVersion.status, 2);
  assert.match(noVersion.stderr, /--version/);
  const bad = run([...full, '--version', 'banana']);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /--version/);
  const missing = run(['--setup', join(paths.setup, 'nope'), ...full.slice(2), '--version', '2.2.0']);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /--setup/);
  const ok = run([...full, '--version', '2.2.0']);
  assert.equal(ok.status, 0);
  assert.equal(ok.stdout.trim(), sha(readFileSync(paths.out)));
});
