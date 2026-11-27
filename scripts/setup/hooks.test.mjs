import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const tauriDir = new URL('../../apps/desktop/src-tauri/', import.meta.url);
const hooks = readFileSync(new URL('windows/hooks.nsh', tauriDir), 'utf8');
const conf = JSON.parse(readFileSync(new URL('tauri.conf.json', tauriDir), 'utf8'));

function macro(name) {
  const m = hooks.match(new RegExp(`!macro ${name}\\r?\\n([\\s\\S]*?)!macroend`));
  assert.ok(m, `macro ${name} missing`);
  return m[1];
}

test('BK_HOOKS_DIR is defined outside the macros', () => {
  const outside = hooks.replace(/!macro [\s\S]*?!macroend/g, '');
  assert.match(outside, /^!define BK_HOOKS_DIR "\$\{__FILEDIR__\}"$/m);
});

test('__FILEDIR__ does not appear inside macros', () => {
  for (const name of ['NSIS_HOOK_POSTINSTALL', 'NSIS_HOOK_POSTUNINSTALL']) {
    assert.ok(!macro(name).includes('__FILEDIR__'));
  }
});

test('post-install registers the brand uninstaller', () => {
  const body = macro('NSIS_HOOK_POSTINSTALL');
  assert.ok(body.includes('"UninstallString" "$\\"$INSTDIR\\bookeeper-setup.exe$\\" --uninstall"'));
  assert.ok(body.includes('"QuietUninstallString"'));
  assert.ok(body.indexOf('SetOverwrite try') >= 0 && body.indexOf('SetOverwrite try') < body.indexOf('File '));
});

test('post-uninstall deletes the setup', () => {
  assert.match(macro('NSIS_HOOK_POSTUNINSTALL'), /Delete "\$INSTDIR\\bookeeper-setup\.exe"/);
});

test('tauri.conf.json wires the hook and the DMG', () => {
  const nsis = conf.bundle.windows.nsis;
  assert.equal(nsis.installerHooks, 'windows/hooks.nsh');
  assert.equal(nsis.installMode, 'currentUser');
  assert.ok(existsSync(new URL(nsis.installerHooks, tauriDir)));
  const dmg = conf.bundle.macOS.dmg;
  assert.equal(dmg.background, 'dmg/background.png');
  assert.deepEqual(dmg.windowSize, { width: 660, height: 400 });
  assert.deepEqual(dmg.appPosition, { x: 180, y: 180 });
  assert.deepEqual(dmg.applicationFolderPosition, { x: 480, y: 180 });
  assert.ok(existsSync(new URL(dmg.background, tauriDir)));
});
