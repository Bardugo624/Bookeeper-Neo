#!/usr/bin/env node
// Publishes updates and installers to the R2 bucket (through `aws`), seeds it, withdraws a version.
//
//   node scripts/updates-r2.mjs publish  --version <v> --updates <dir> --installers <dir> --notes-file <f> --base <url> [--dry-run]
//   node scripts/updates-r2.mjs seed     --from <dir> --from-base <url> --base <url> [--dry-run]
//   node scripts/updates-r2.mjs withdraw --channel <stable|beta> --version <v> --base <url> [--dry-run]
//   node scripts/updates-r2.mjs ready    --base <url> --vps <url>
//
// Bucket commands need R2_ACCOUNT_ID, R2_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (exit 2 if missing).
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MissingEnvError, openBucket } from "./r2/bucket.mjs";
import { publish, seed, withdraw } from "./r2/commands.mjs";
import { checkReady } from "./r2/ready.mjs";

const SPEC = {
  publish: { need: ["version", "updates", "installers", "base"], opt: ["notes-file"] },
  seed: { need: ["from", "from-base", "base"], opt: [] },
  withdraw: { need: ["channel", "version", "base"], opt: [] },
  ready: { need: ["base", "vps"], opt: [] },
};

class UsageError extends Error {}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const spec = SPEC[command];
  if (!spec) throw new UsageError(`unknown command "${command ?? ""}": use ${Object.keys(SPEC).join(", ")}`);
  const a = {};
  for (let i = 0; i < rest.length; i++) {
    const k = rest[i];
    if (k === "--dry-run" && command !== "ready") a.dryRun = true;
    else if (k.startsWith("--") && [...spec.need, ...spec.opt].includes(k.slice(2)) && i + 1 < rest.length) a[k.slice(2)] = rest[++i];
    else throw new UsageError(`bad argument: ${k}`);
  }
  const missing = spec.need.filter((k) => !a[k]);
  if (missing.length) throw new UsageError(`missing ${missing.map((k) => `--${k}`).join(", ")}`);
  if (command === "withdraw" && !["stable", "beta"].includes(a.channel)) throw new UsageError("--channel must be stable or beta");
  return { command, a };
}

export async function run(argv, env = process.env) {
  const { command, a } = parseArgs(argv);
  if (command === "ready") {
    const { ok, problems } = await checkReady({ base: a.base, vps: a.vps });
    if (ok) console.log("R2 is ready");
    else for (const p of problems) console.error(`not ready: ${p}`);
    return ok ? 0 : 1;
  }
  const bucket = openBucket({ env, dryRun: !!a.dryRun });
  if (command === "publish") {
    await publish({ bucket, base: a.base, version: a.version, updates: a.updates, installers: a.installers, notesFile: a["notes-file"] });
  } else if (command === "seed") {
    await seed({ bucket, from: a.from, fromBase: a["from-base"], base: a.base });
  } else {
    await withdraw({ bucket, base: a.base, channel: a.channel, version: a.version });
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      console.error(`error: ${e.message}`);
      process.exit(e instanceof MissingEnvError || e instanceof UsageError ? 2 : 1);
    },
  );
}
