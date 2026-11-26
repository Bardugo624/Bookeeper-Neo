#!/usr/bin/env node
// Prints the notes of one version from CHANGELOG.md: the body of its `## [x.y.z]` section,
// title excluded, leading and trailing blank lines removed.
//
//   node scripts/release-notes.mjs --version <v> [--changelog CHANGELOG.md] [--out <file>]
//
// The title may carry a date (`## [2.0.0] - 2026-11-26`). A missing or empty section is an error.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The notes of `version` in `changelog` text. Throws if the section is missing or empty. */
export function extractNotes(changelog, version) {
  const lines = changelog.replace(/\r\n?/g, "\n").split("\n");
  const isTitle = (l) => /^##[ \t]+\[/.test(l);
  const mine = (l) => {
    const m = /^##[ \t]+\[([^\]]*)\]/.exec(l);
    return m !== null && m[1] === version;
  };
  const start = lines.findIndex(mine);
  if (start === -1) throw new Error(`no section "## [${version}]" in the changelog`);
  let end = lines.findIndex((l, i) => i > start && isTitle(l));
  if (end === -1) end = lines.length;
  const body = lines.slice(start + 1, end);
  while (body.length && body[0].trim() === "") body.shift();
  while (body.length && body[body.length - 1].trim() === "") body.pop();
  if (body.length === 0) throw new Error(`the section "## [${version}]" is empty`);
  return `${body.join("\n")}\n`;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i];
    if (!k.startsWith("--") || i + 1 >= argv.length) throw new Error(`bad argument: ${k}`);
    out[k.slice(2)] = argv[i + 1];
  }
  return out;
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.version) throw new Error("missing --version");
  const notes = extractNotes(readFileSync(a.changelog ?? "CHANGELOG.md", "utf8"), a.version);
  if (a.out) {
    writeFileSync(a.out, notes);
    console.error(`wrote ${a.out}`);
  } else {
    process.stdout.write(notes);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(`::error::${e.message}`);
    process.exit(1);
  }
}
