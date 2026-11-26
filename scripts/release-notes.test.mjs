import assert from "node:assert/strict";
import { test } from "node:test";
import { extractNotes } from "./release-notes.mjs";

const log = `# Changelog

Intro.

## [2.1.0] - 2027-01-01

Nuova.

## [2.0.0] - 2026-11-26

### Added

- uno
- due

## [2.0.0-beta.1]

Beta.

## [1.0.0]

Prima.
`;

test("section in the middle, with a date", () => {
  assert.equal(extractNotes(log, "2.0.0"), "### Added\n\n- uno\n- due\n");
});

test("last section, without a date", () => {
  assert.equal(extractNotes(log, "1.0.0"), "Prima.\n");
});

test("first section", () => {
  assert.equal(extractNotes(log, "2.1.0"), "Nuova.\n");
});

test("a version does not match one it prefixes", () => {
  assert.equal(extractNotes(log, "2.0.0-beta.1"), "Beta.\n");
  assert.throws(() => extractNotes("## [2.0.0-beta.1]\n\nx\n", "2.0.0"), /no section/);
});

test("missing version", () => {
  assert.throws(() => extractNotes(log, "9.9.9"), /no section "## \[9\.9\.9\]"/);
});

test("empty section", () => {
  assert.throws(() => extractNotes("## [2.0.0]\n\n\n## [1.0.0]\n\nx\n", "2.0.0"), /empty/);
  assert.throws(() => extractNotes("## [2.0.0] - 2026-11-26\n", "2.0.0"), /empty/);
});

test("CRLF input", () => {
  assert.equal(extractNotes("## [2.0.0]\r\n\r\nA\r\n\r\n## [1.0.0]\r\nB\r\n", "2.0.0"), "A\n");
});
