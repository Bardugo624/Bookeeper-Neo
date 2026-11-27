// A fake `aws` for tests: the bucket is a folder (FAKE_AWS_DIR), every call is logged as JSON lines
// in FAKE_AWS_LOG. Supports `s3 cp`, `s3 ls --recursive`, `s3 rm`.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const VALUE_FLAGS = new Set(["--endpoint-url", "--cache-control", "--content-type"]);
const args = process.argv.slice(2);
const pos = [];
const flags = {};
for (let i = 0; i < args.length; i++) {
  if (VALUE_FLAGS.has(args[i])) flags[args[i]] = args[++i];
  else if (args[i].startsWith("--")) flags[args[i]] = true;
  else pos.push(args[i]);
}
const root = process.env.FAKE_AWS_DIR;
const metaFile = join(root, ".meta.json");
const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, "utf8")) : {};
const log = (o) => appendFileSync(process.env.FAKE_AWS_LOG, `${JSON.stringify(o)}\n`);
const die = (msg) => (console.error(msg), process.exit(1));

const [service, op, a, b] = pos;
if (service !== "s3") die("fake aws: only s3");
const env = {
  endpoint: flags["--endpoint-url"],
  region: process.env.AWS_DEFAULT_REGION,
  reqChecksum: process.env.AWS_REQUEST_CHECKSUM_CALCULATION,
  resChecksum: process.env.AWS_RESPONSE_CHECKSUM_VALIDATION,
};
const split = (uri) => {
  const m = /^s3:\/\/([^/]+)\/(.*)$/.exec(uri);
  if (!m) die(`bad uri ${uri}`);
  return { bucket: m[1], key: m[2] };
};
const path = (u) => join(root, u.bucket, ...u.key.split("/"));

if (op === "cp" && !a.startsWith("s3://")) {
  const u = split(b);
  log({ op: "put", key: u.key, bucket: u.bucket, cache: flags["--cache-control"], type: flags["--content-type"], ...env });
  mkdirSync(dirname(path(u)), { recursive: true });
  writeFileSync(path(u), readFileSync(a));
  meta[u.key] = { cache: flags["--cache-control"], type: flags["--content-type"] };
  writeFileSync(metaFile, JSON.stringify(meta));
} else if (op === "cp") {
  const u = split(a);
  log({ op: "get", key: u.key, ...env });
  if (!existsSync(path(u))) die(`An error occurred (404) when calling the HeadObject operation: Key "${u.key}" does not exist`);
  process.stdout.write(readFileSync(path(u)));
} else if (op === "ls") {
  const u = split(a);
  log({ op: "ls", key: u.key, ...env });
  const walk = (dir, rel) =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? walk(p, `${rel}${n}/`) : [`${rel}${n}`];
    });
  const base = join(root, u.bucket);
  const all = existsSync(base) ? walk(base, "").filter((k) => k.startsWith(u.key)) : [];
  for (const k of all) console.log(`2026-01-01 00:00:00 ${String(statSync(join(base, k)).size).padStart(10)} ${k}`);
  process.exit(all.length ? 0 : 1);
} else if (op === "rm") {
  const u = split(a);
  log({ op: "rm", key: u.key, ...env });
  rmSync(path(u), { force: true });
  delete meta[u.key];
  writeFileSync(metaFile, JSON.stringify(meta));
} else die(`fake aws: unsupported ${op}`);
