// @vitest-environment node
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { afterAll, expect, it } from 'vitest';
import { foliateAssets } from './foliateAssets';

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

it('foliate_assets_copies_the_vendor_tree', async () => {
  const root = mkdtempSync(join(tmpdir(), 'reader-assets-'));
  dirs.push(root);
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>x</title><script type="module" src="/main.js"></script>');
  writeFileSync(join(root, 'main.js'), 'console.log(1);');
  await build({ root, logLevel: 'silent', configFile: false, plugins: [foliateAssets()], build: { outDir: 'dist' } });
  const out = join(root, 'dist', 'reader', 'foliate-js');
  expect(existsSync(join(out, 'view.js'))).toBe(true);
  expect(existsSync(join(out, 'vendor', 'pdfjs', 'pdf.worker.mjs'))).toBe(true);
  expect(existsSync(join(out, 'vendor', 'pdfjs', 'cmaps', '78-H.bcmap'))).toBe(true);
  expect(existsSync(join(out, 'vendor', 'zip.js'))).toBe(true);
}, 60_000);
