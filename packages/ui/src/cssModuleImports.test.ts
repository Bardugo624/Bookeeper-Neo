import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('css module imports', () => {
  it('no_side_effect_import_of_a_css_module', () => {
    const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', 'packages', 'apps'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
      .split('\0')
      .filter((f) => /\.(tsx?|jsx?|mts|cts)$/.test(f));
    const bad: string[] = [];
    for (const file of files) {
      let text: string;
      try {
        text = readFileSync(path.join(root, file), 'utf8');
      } catch {
        continue;
      }
      if (/^\s*import\s+['"][^'"]*\.module\.css['"]/m.test(text)) bad.push(file);
    }
    // Vite drops a module imported for its effect only: the rules never reach the build.
    expect(bad).toEqual([]);
  });
});
