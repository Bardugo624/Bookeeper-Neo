#!/usr/bin/env node
// A fake `gh` for tests. Logs its arguments and answers from a JSON scenario:
//   BK_FAKE_GH_SCENARIO = file with [{ match: ["run","list"], stdout, stderr, code }]
//   BK_FAKE_GH_LOG      = file that receives one JSON array of args per line
import { spawnSync } from 'node:child_process';
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Create <dir>/gh (and gh.cmd) that run this file; returns the paths to hand to the child env.
export function installFakeGh(dir, scenario) {
  mkdirSync(dir, { recursive: true });
  const self = fileURLToPath(import.meta.url);
  writeFileSync(join(dir, 'gh'), `#!/bin/sh\nexec "${process.execPath}" "${self}" "$@"\n`);
  chmodSync(join(dir, 'gh'), 0o755);
  writeFileSync(join(dir, 'gh.cmd'), `@"${process.execPath}" "${self}" %*\r\n`);
  const scenarioFile = join(dir, 'scenario.json');
  const logFile = join(dir, 'calls.log');
  writeFileSync(scenarioFile, JSON.stringify(scenario));
  writeFileSync(logFile, '');
  return {
    env: { BK_FAKE_GH_SCENARIO: scenarioFile, BK_FAKE_GH_LOG: logFile },
    calls: () => readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)),
  };
}

// A directory that puts git, and only git, on PATH. On some machines, such as GitHub's runners,
// the real gh sits next to git and would answer in place of a fake or missing one.
export function gitOnlyDir(dir) {
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['git'], { encoding: 'utf8' });
  const git = which.stdout.split(/\r?\n/)[0].trim() || '/usr/bin/git';
  const home = dirname(git);
  if (!existsSync(join(home, process.platform === 'win32' ? 'gh.exe' : 'gh'))) return home;
  mkdirSync(dir, { recursive: true });
  symlinkSync(git, join(dir, basename(git)));
  return dir;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  if (process.env.BK_FAKE_GH_LOG) appendFileSync(process.env.BK_FAKE_GH_LOG, `${JSON.stringify(args)}\n`);
  const rules = JSON.parse(readFileSync(process.env.BK_FAKE_GH_SCENARIO, 'utf8'));
  const line = args.join(' ');
  const rule = rules.find((r) => r.match.every((m) => line.includes(m)));
  if (!rule) {
    process.stderr.write(`fake-gh: no rule for: ${line}\n`);
    process.exit(99);
  }
  if (rule.stdout !== undefined) process.stdout.write(typeof rule.stdout === 'string' ? rule.stdout : JSON.stringify(rule.stdout));
  if (rule.stderr) process.stderr.write(rule.stderr);
  process.exit(rule.code ?? 0);
}
