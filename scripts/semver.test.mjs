import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, compare, inc, isPrerelease } from './semver.mjs';

test('inc da stabile', () => {
  assert.equal(inc('2.1.0', 'patch'), '2.1.1');
  assert.equal(inc('2.1.0', 'minor'), '2.2.0');
  assert.equal(inc('2.1.0', 'major'), '3.0.0');
  assert.equal(inc('2.1.0', 'beta'), '2.2.0-beta.1');
});

test('inc da beta', () => {
  assert.equal(inc('2.2.0-beta.1', 'beta'), '2.2.0-beta.2');
  assert.equal(inc('2.2.0-beta.3', 'patch'), '2.2.0');
  assert.equal(inc('2.2.0-beta.3', 'minor'), '2.2.0');
  assert.equal(inc('2.2.1-beta.1', 'minor'), '2.3.0');
  assert.equal(inc('2.2.0-beta.3', 'major'), '3.0.0');
  assert.equal(inc('3.0.0-beta.2', 'major'), '3.0.0');
});

test('compare', () => {
  assert.equal(compare('2.2.0-beta.1', '2.2.0'), -1);
  assert.equal(compare('2.2.0', '2.2.0-beta.1'), 1);
  assert.equal(compare('2.2.0-beta.10', '2.2.0-beta.9'), 1);
  assert.equal(compare('2.10.0', '2.9.0'), 1);
  assert.equal(compare('2.1.0', '2.1.0'), 0);
  assert.equal(compare('2.2.0-beta.1', '2.2.0-beta.1'), 0);
});

test('parse e errori', () => {
  assert.deepEqual(parse('2.2.0-beta.1'), { major: 2, minor: 2, patch: 0, pre: ['beta', 1] });
  assert.throws(() => parse('v2.1.0'));
  assert.throws(() => parse('2.1'));
  assert.throws(() => parse('2.1.0+build'));
  assert.throws(() => inc('2.2.0-rc.1', 'beta'));
  assert.equal(isPrerelease('2.2.0-beta.1'), true);
  assert.equal(isPrerelease('2.2.0'), false);
});
