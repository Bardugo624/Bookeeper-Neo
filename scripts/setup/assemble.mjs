#!/usr/bin/env node
// Builds the downloadable file: setup.exe ‖ NSIS installer ‖ metadata ‖ 24-byte tail.
// Format mirrors crates/bookeeper-setup-core/src/payload.rs.
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';

export const MAGIC = Buffer.from('BKSETUP1', 'ascii');
export const TAIL_LEN = 24;
const MAIN_NAME = 'bookeeper-desktop.exe';
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

export class UsageError extends Error {}

async function sha256Of(path) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

function check(opts) {
  for (const key of ['setup', 'payload', 'main', 'version', 'out']) {
    if (!opts[key]) throw new UsageError(`--${key} is required`);
  }
  if (!SEMVER.test(opts.version)) throw new UsageError(`--version is not a valid version: ${opts.version}`);
  for (const key of ['setup', 'payload', 'main']) {
    if (!existsSync(opts[key]) || !statSync(opts[key]).isFile()) {
      throw new UsageError(`--${key} file not found: ${opts[key]}`);
    }
  }
}

/** Writes `out` and returns `{ sha256, meta }` (sha256 of the produced file). */
export async function assemble(opts) {
  check(opts);
  const setupBytes = statSync(opts.setup).size;
  const payloadBytes = statSync(opts.payload).size;
  const mainBytes = statSync(opts.main).size;
  const [payloadSha, mainSha] = await Promise.all([sha256Of(opts.payload), sha256Of(opts.main)]);
  const meta = {
    version: opts.version,
    payload: { name: basename(opts.payload), bytes: payloadBytes, sha256: payloadSha },
    main: { name: MAIN_NAME, bytes: mainBytes, sha256: mainSha },
    installed_bytes: mainBytes + setupBytes,
  };
  const json = Buffer.from(JSON.stringify(meta), 'utf8');
  const tail = Buffer.alloc(TAIL_LEN);
  MAGIC.copy(tail, 0);
  tail.writeUInt32LE(json.length, 8);
  tail.writeBigUInt64LE(BigInt(payloadBytes), 12);

  const hash = createHash('sha256');
  const sink = new PassThrough();
  sink.on('data', (chunk) => hash.update(chunk));
  const out = createWriteStream(opts.out);
  const done = pipeline(sink, out);
  for (const file of [opts.setup, opts.payload]) {
    await new Promise((resolve, reject) => {
      const src = createReadStream(file);
      src.on('error', reject);
      src.on('end', resolve);
      src.pipe(sink, { end: false });
    });
  }
  sink.write(json);
  sink.end(tail);
  await done;
  return { sha256: hash.digest('hex'), meta };
}

/** Parses a buffer that ends with `metadata ‖ tail`. Returns `{ meta, payloadLen }` or null. */
export function readTail(buffer) {
  if (buffer.length < TAIL_LEN) return null;
  const tail = buffer.subarray(buffer.length - TAIL_LEN);
  if (!tail.subarray(0, 8).equals(MAGIC)) return null;
  const metaLen = tail.readUInt32LE(8);
  const payloadLen = Number(tail.readBigUInt64LE(12));
  const metaStart = buffer.length - TAIL_LEN - metaLen;
  if (metaStart < 0) throw new Error('tail lengths fall outside the file');
  const meta = JSON.parse(buffer.subarray(metaStart, buffer.length - TAIL_LEN).toString('utf8'));
  if (meta.payload.bytes !== payloadLen) throw new Error('tail lengths fall outside the file');
  return { meta, payloadLen };
}

function parseArgs(argv) {
  const opts = {};
  const known = new Set(['setup', 'payload', 'main', 'version', 'out']);
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    if (!flag?.startsWith('--') || !known.has(flag.slice(2))) throw new UsageError(`unknown argument: ${flag}`);
    if (argv[i + 1] === undefined) throw new UsageError(`${flag} needs a value`);
    opts[flag.slice(2)] = argv[i + 1];
  }
  return opts;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const { sha256 } = await assemble(parseArgs(process.argv.slice(2)));
    console.log(sha256);
  } catch (e) {
    console.error(`assemble: ${e.message}`);
    process.exit(e instanceof UsageError ? 2 : 1);
  }
}
