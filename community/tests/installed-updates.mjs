import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/** Exercise the installed preload, main-process service, and UI with an owned feed fixture. */
export async function qualifyInstalledUpdates(app, page, output) {
  const expected = JSON.parse(await readFile(new URL('../release.json', import.meta.url), 'utf8')).version;
  const identity = await app.evaluate(async ({ app }) => {
    const { readFile } = await import('node:fs/promises');
    const manifest = JSON.parse(await readFile(app.getAppPath() + '/package.json', 'utf8'));
    const { createRequire } = await import('node:module');
    const updater = createRequire(app.getAppPath() + '/package.json')('electron-updater').autoUpdater;
    if (updater.autoDownload !== false || updater.autoInstallOnAppQuit !== false) throw new Error('Automatic installation must be disabled');
    return { version: manifest.dshCommunityVersion, arch: process.arch, platform: process.platform };
  });
  assert.equal(identity.version, expected);
  const version = expected.replace(/community\.(\d+)$/, (_, n) => `community.${Number(n) + 1}`);
  await app.evaluate(({ net, shell }, { version, identity }) => {
    const platform = identity.platform === 'win32' ? 'Windows' : 'macOS';
    const os = identity.platform === 'win32' ? 'win' : 'mac';
    const extension = identity.platform === 'win32' ? 'exe' : 'dmg';
    const url = `https://github.com/AiW520/DSH-TuZi/releases/download/v${version}/dsh-tuzi-0.2.1-rc.3-${os}-${identity.arch}-unsigned.${extension}`;
    const originalFetch = net.fetch, originalOpen = shell.openExternal;
    globalThis.__updateQualification = { requests: 0, opened: [], offline: false,
      restore: () => { net.fetch = originalFetch; shell.openExternal = originalOpen; } };
    net.fetch = async (input, options) => {
      if (input !== 'https://aiw520.github.io/DSH-TuZi/releases.json') return originalFetch(input, options);
      globalThis.__updateQualification.requests++;
      if (globalThis.__updateQualification.offline) throw new Error('Qualification network unavailable');
      return Response.json({ schemaVersion: 1, releases: [{ platform, arch: identity.arch, version, qualified: true, signing: 'unsigned-test', bytes: 120, sha256: 'a'.repeat(64), url, notes: 'Qualification release: manual installation only.' }] });
    };
    shell.openExternal = async target => {
      if (target === url || target === `https://github.com/AiW520/DSH-TuZi/releases/tag/v${version}`) { globalThis.__updateQualification.opened.push(target); return; }
      return originalOpen(target);
    };
  }, { version, identity });
  try {
    await page.waitForFunction(() => !!window.dshCommunityUpdates);
    const state = await page.evaluate(() => window.dshCommunityUpdates.action('check'));
    assert.equal(state.currentVersion, expected); assert.equal(state.phase, 'available');
    assert.equal(state.release.version, version); assert.equal(state.arch, identity.arch);
    assert.equal(await page.locator('dialog').count(), 0, 'manual IPC check alone cannot interrupt tasks');
    await page.getByRole('button', { name: /^(发现新版本|New version available)$/ }).click();
    await page.getByRole('dialog').waitFor();
    await page.screenshot({ path: output + '/updates.png' });
    await page.getByRole('button', { name: /^(下载此平台安装包|Download installer for this platform)$/ }).click();
    await page.getByRole('status').filter({ hasText: /浏览器|browser/ }).waitFor();
    const opened = await app.evaluate(() => globalThis.__updateQualification.opened);
    assert.deepEqual(opened, [state.release.url]);
    await page.getByRole('button', { name: /^(24 小时后提醒|Remind me in 24 hours)$/ }).click();
    await page.waitForFunction(async () => (await window.dshCommunityUpdates.status()).suppressed === 'snoozed');
    await page.keyboard.press('Escape');
    await page.evaluate(version => window.dshCommunityUpdates.action('ignore', version), version);
    const saved = await app.evaluate(async ({ app }) => {
      const { readFile } = await import('node:fs/promises');
      return JSON.parse(await readFile(app.getPath('userData') + '/community-update-preferences.json', 'utf8'));
    });
    assert.equal(saved.ignored, version);
    await app.evaluate(() => { globalThis.__updateQualification.offline = true; });
    assert.equal((await page.evaluate(() => window.dshCommunityUpdates.action('check'))).phase, 'error');
    assert.equal(await page.locator('dialog').count(), 0);
    await app.evaluate(({ Menu }) => {
      const find = items => { for (const item of items) { if (/检查更新|Check for updates/i.test(item.label)) return item; if (item.submenu) { const nested = find(item.submenu.items); if (nested) return nested; } } };
      const item = find(Menu.getApplicationMenu().items);
      if (!item) throw new Error('Missing native update menu');
      item.click();
    });
    await page.getByRole('dialog').waitFor();
    await page.getByRole('status').filter({ hasText: /无法检查|Could not check/ }).waitFor();
    await page.keyboard.press('Escape');
    return { communityVersion: expected, platform: identity.platform, arch: identity.arch, qualified: true, tests: ['embedded community identity', 'installed update IPC and passive reminder', 'explicit platform download', 'persistent snooze and ignore', 'quiet network failure'] };
  } finally { await app.evaluate(() => { globalThis.__updateQualification.restore(); delete globalThis.__updateQualification; }); }
}
