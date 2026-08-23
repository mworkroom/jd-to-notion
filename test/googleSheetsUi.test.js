import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = {
  html: new URL('../public/index.html', import.meta.url),
  app: new URL('../public/app.js', import.meta.url),
  macro: new URL('../scripts/sync-google-sheets.ps1', import.meta.url),
  ahk: new URL('../automation/jandi-to-admissions.ahk', import.meta.url)
};

test('Google Sheets panel exposes preview, result, refresh, and guarded sync controls', async () => {
  const [html, app] = await Promise.all([
    readFile(files.html, 'utf8'),
    readFile(files.app, 'utf8')
  ]);

  for (const id of [
    'google-sheets-target',
    'google-sheets-unsynced',
    'google-sheets-last-synced',
    'google-sheets-preview',
    'google-sheets-result',
    'refresh-google-sheets-button',
    'sync-google-sheets-button'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  assert.match(app, /refreshGoogleSheetsPanel\(\);/u);
  assert.match(app, /mode: 'controlled'/u);
  assert.match(app, /confirm: true/u);
  assert.match(app, /outputGroupKeys: rows\.map/u);
  assert.match(app, /googleSheetsBusy/u);
  assert.match(app, /C:G만 기록하며 A:B는 변경하지 않습니다/u);
});

test('macro shortcut ensures the local server and invokes the same all-mode sync safely', async () => {
  const [macro, ahk] = await Promise.all([
    readFile(files.macro, 'utf8'),
    readFile(files.ahk, 'utf8')
  ]);

  assert.match(ahk, /\^!\+F10::/u);
  assert.match(ahk, /sync-google-sheets\.ps1/u);
  assert.match(macro, /-EnsureRunning/u);
  assert.match(macro, /api\/google-sheets\/sync/u);
  assert.match(macro, /mode = 'all'; confirm = \$true/u);
  assert.match(macro, /ShowBalloonTip/u);
  assert.match(macro, /전송 가능한 Work Log가 없습니다\./u);
  assert.match(macro, /보류 \$\(\$result\.heldPageCount\)건/u);
});

test('JANDI import shortcut ensures the local server before reading and pasting', async () => {
  const ahk = await readFile(files.ahk, 'utf8');
  const f12Block = ahk.slice(
    ahk.indexOf('^!+F12::'),
    ahk.indexOf('^!+F10::')
  );

  assert.match(f12Block, /if !EnsureJdToNotionRunning\(\)/u);
  assert.match(ahk, /launcherPath := .*start-local-app\.ps1/u);
  assert.match(ahk, /-NoBrowser -NoDialogs -EnsureRunning/u);
  assert.match(ahk, /RunWait\(command, , "Hide"\)/u);
});
