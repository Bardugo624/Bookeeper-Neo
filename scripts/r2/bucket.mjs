// Bucket access through the `aws` CLI. The command line is never printed.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cacheControl, contentType } from "./plan.mjs";

export const REQUIRED_ENV = ["R2_ACCOUNT_ID", "R2_BUCKET", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"];

export const missingEnv = (env) => REQUIRED_ENV.filter((k) => !env[k]);

export class MissingEnvError extends Error {
  constructor(names) {
    super(`missing environment variables: ${names.join(", ")}`);
    this.names = names;
  }
}

const NOT_FOUND = /\b404\b|NoSuchKey|Not Found|does not exist/i;

/**
 * `dryRun` skips every write. With `dryRun` and incomplete variables the bucket is empty
 * and nothing is read; without `dryRun` incomplete variables throw MissingEnvError.
 */
export function openBucket({ env = process.env, dryRun = false, log = console.log } = {}) {
  const missing = missingEnv(env);
  if (missing.length && !dryRun) throw new MissingEnvError(missing);
  const offline = missing.length > 0;
  const bucket = env.R2_BUCKET;
  const awsEnv = {
    ...env,
    AWS_DEFAULT_REGION: "auto",
    AWS_REQUEST_CHECKSUM_CALCULATION: "when_required",
    AWS_RESPONSE_CHECKSUM_VALIDATION: "when_required",
  };
  const endpoint = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

  function aws(args) {
    const r = spawnSync("aws", [...args, "--endpoint-url", endpoint], {
      env: awsEnv,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      shell: false,
    });
    if (r.error) throw new Error(`cannot run aws: ${r.error.message}`);
    return r;
  }
  const fail = (what, r) => {
    const line = (r.stderr || "").trim().split("\n").pop();
    return new Error(`aws ${what} failed (exit ${r.status}): ${line}`);
  };
  const uri = (key) => `s3://${bucket}/${key}`;

  return {
    dryRun,
    async get(key) {
      if (offline) return null;
      const r = aws(["s3", "cp", uri(key), "-"]);
      if (r.status === 0) return r.stdout;
      if (NOT_FOUND.test(r.stderr || "")) return null;
      throw fail("cp (read)", r);
    },
    async list(prefix) {
      if (offline) return [];
      const r = aws(["s3", "ls", uri(prefix), "--recursive"]);
      if (r.status !== 0) {
        if (r.status === 1 && !(r.stderr || "").trim()) return [];
        throw fail("ls", r);
      }
      return r.stdout
        .split("\n")
        .map((l) => /^\S+\s+\S+\s+\d+\s+(.+)$/.exec(l)?.[1])
        .filter(Boolean);
    },
    async put(file, key) {
      if (dryRun) return log(`[dry-run] would upload ${key}`);
      const r = aws(["s3", "cp", file, uri(key), "--cache-control", cacheControl(key), "--content-type", contentType(key)]);
      if (r.status !== 0) throw fail("cp (write)", r);
      log(`uploaded ${key}`);
    },
    async putText(text, key) {
      if (dryRun) return log(`[dry-run] would upload ${key}`);
      const dir = mkdtempSync(join(tmpdir(), "r2-"));
      try {
        const file = join(dir, "body");
        writeFileSync(file, text);
        await this.put(file, key);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    async remove(key) {
      if (dryRun) return log(`[dry-run] would delete ${key}`);
      const r = aws(["s3", "rm", uri(key)]);
      if (r.status !== 0) throw fail("rm", r);
      log(`deleted ${key}`);
    },
  };
}
