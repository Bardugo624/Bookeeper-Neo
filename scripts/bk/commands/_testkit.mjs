// Test helpers for the publish commands. Not a command and not a test file.
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakeGh } from '../fake-gh.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const projectRoot = join(here, '..', '..', '..');
const bk = join(projectRoot, 'scripts', 'bk.mjs');
export const tmp = () => mkdtempSync(join(tmpdir(), 'bk-pub-'));

const VERSION_FILES = [
  'Cargo.toml', 'Cargo.lock', 'package-lock.json', 'CHANGELOG.md', 'apps/desktop/src-tauri/tauri.conf.json', 'packages/api/openapi.json',
  ...['packages/ui', 'packages/api', 'packages/i18n', 'apps/desktop', 'apps/mobile'].map((p) => `${p}/package.json`),
];

export const git = (cwd, ...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, encoding: 'utf8' });

// A repository on `branchName` with the version files copied from this project, pushed to a local bare remote.
export function repo(branchName = 'main') {
  const base = tmp();
  const remote = join(base, 'remote.git');
  const dir = join(base, 'repo');
  mkdirSync(dir);
  git(base, 'init', '--bare', remote);
  git(dir, 'init', '-b', branchName);
  for (const f of VERSION_FILES) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    copyFileSync(join(projectRoot, f), join(dir, f));
  }
  git(dir, 'add', '.');
  git(dir, 'commit', '-m', 'base');
  git(dir, 'remote', 'add', 'origin', remote);
  git(dir, 'push', '-u', 'origin', branchName);
  return { dir, remote };
}

// Local HTTP server. A route is a body (JSON), a function (req, n) => [status, body, headers], or absent (404).
export async function serve(routes) {
  const counts = {};
  const srv = createServer((req, res) => {
    const route = routes[req.url];
    counts[req.url] = (counts[req.url] ?? 0) + 1;
    let [status, body, headers] = typeof route === 'function' ? route(req, counts[req.url]) : route ? [200, route] : [404, ''];
    res.writeHead(status, headers);
    res.end(req.method === 'HEAD' ? undefined : typeof body === 'string' ? body : JSON.stringify(body));
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() };
}

const RUN = [{ databaseId: 7, createdAt: '2999-01-01T00:00:00Z', status: 'completed', conclusion: 'success', url: 'https://gh.test/run/7' }];
// Rules every successful workflow needs; `extra` goes first so it wins.
export const okRules = (extra = []) => [
  ...extra,
  { match: ['run', 'list'], stdout: RUN },
  { match: ['run', 'watch'], code: 0 },
  { match: ['workflow', 'run'], code: 0 },
  { match: ['variable'], code: 0 },
];
export const failingWatch = { match: ['run', 'watch'], code: 1 };

// Run bk in a child with the fake gh first on PATH. Async: the test servers live in this process.
export function runBk(args, { scenario, env = {}, cwd, input = '' } = {}) {
  const dir = tmp();
  const fake = installFakeGh(join(dir, 'bin'), scenario);
  const gitDir = dirname(spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim() || '/usr/bin/git');
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [bk, ...args], {
      cwd,
      env: {
        ...process.env, ...fake.env, PATH: [join(dir, 'bin'), gitDir].join(delimiter), BK_ROOT: cwd,
        BK_UPDATES_BASE: 'http://127.0.0.1:1', BK_VPS_BASE: 'http://127.0.0.1:1', BK_SERVER_URL: 'http://127.0.0.1:1/x',
        BK_POLL_MS: '50', BK_POLL_TIMEOUT_MS: '1500', ...env,
      },
    });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d));
    p.stderr.on('data', (d) => (stderr += d));
    p.stdin.end(input);
    p.on('close', (status) => resolve({ status, stdout, stderr, calls: () => fake.calls() }));
  });
}

export const workflowCalls = (r) => r.calls().filter((a) => a[0] === 'workflow');
export { writeFileSync };
