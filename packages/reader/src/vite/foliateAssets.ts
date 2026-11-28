import { cpSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const VENDOR = fileURLToPath(new URL('../../vendor/foliate-js/', import.meta.url));
const BASE = '/reader/foliate-js/';

const TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ttf': 'font/ttf',
  '.json': 'application/json',
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

/**
 * Serves the foliate-js copy under `/reader/foliate-js/` while developing and copies it to
 * `dist/reader/foliate-js/` in the build, with its relative paths intact. `vendor` is the folder to serve:
 * only the tests change it.
 */
export function foliateAssets(vendor: string = VENDOR): Plugin {
  let outDir = 'dist';
  let root = process.cwd();
  return {
    name: 'bookeeper-foliate-assets',
    configResolved(config) {
      outDir = config.build.outDir;
      root = config.root;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0]!;
        if (!url.startsWith(BASE)) return next();
        const rel = decodeURIComponent(url.slice(BASE.length));
        const path = join(vendor, rel);
        // Nothing outside the copy, whatever the request says.
        if (relative(vendor, path).startsWith('..') || !existsSync(path) || !statSync(path).isFile()) return next();
        res.setHeader('Content-Type', TYPES[extname(path)] ?? 'application/octet-stream');
        res.end(readFileSync(path));
      });
    },
    closeBundle() {
      const target = join(root, outDir, 'reader', 'foliate-js');
      for (const file of files(vendor)) {
        const rel = relative(vendor, file).split(sep).join('/');
        cpSync(file, join(target, ...rel.split('/')));
      }
    },
  };
}

