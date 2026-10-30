import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const { chromium } = require('playwright');
const { build } = createRequire(require.resolve('tsx/package.json'))('esbuild');
const component = fileURLToPath(new URL('../brand/update-panel.jsx', import.meta.url));
const bundle = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {UpdatePanel} from ${JSON.stringify(component)}; createRoot(document.getElementById('root')).render(<React.StrictMode><UpdatePanel/></React.StrictMode>);`, loader: 'jsx', resolveDir: fileURLToPath(new URL('../../apps/web/', import.meta.url)) }, bundle: true, platform: 'browser', write: false, format: 'iife', alias: { react: require.resolve('react') } });
const server = createServer((req, res) => {
  if (req.url === '/app.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(bundle.outputFiles[0].text); }
  else { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root" style="width:180px;overflow:hidden"></div><script src="/app.js"></script>'); }
});
let browser;
try {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  browser = await chromium.launch({ channel: process.env.DSH_TEST_BROWSER_CHANNEL || 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 820 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    const listeners = new Set();
    window.updateState = { currentVersion: '0.2.1-rc.3-community.6', platform: 'Windows', arch: 'x64', phase: 'available', release: { version: '0.2.1-rc.3-community.7', notes: '更新提醒\n任务与桌宠状态优化', bytes: 300000000, signing: 'unsigned-test' }, checkedAt: Date.now(), suppressed: null, preferenceError: false, openRequest: 0, revision: 0 };
    window.calls = [];
    window.emitUpdate = patch => { Object.assign(window.updateState, patch); window.updateState.revision++; for (const cb of listeners) cb({ ...window.updateState }); };
    window.dshCommunityUpdates = {
      status: async () => ({ ...window.updateState }),
      subscribe: cb => { listeners.add(cb); return () => listeners.delete(cb); },
      action: async (action, version) => { window.calls.push({ action, version }); if (window.failAction) throw new Error('disk unavailable'); if (action === 'later') window.emitUpdate({ suppressed: 'snoozed' }); if (action === 'ignore') window.emitUpdate({ suppressed: 'ignored' }); return { ...window.updateState }; },
    };
    window.listenerCount = () => listeners.size;
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('button', { name: '发现新版本', exact: true }).waitFor();
  assert.equal(await page.locator('dialog').count(), 0, 'background notices must not open dialogs');
  assert.equal(await page.evaluate(() => window.listenerCount()), 1, 'StrictMode retains one subscription');
  await page.getByRole('button', { name: '发现新版本', exact: true }).click();
  await page.getByText('0.2.1-rc.3-community.7', { exact: false }).waitFor();
  await page.getByRole('button', { name: '24 小时后提醒' }).click();
  await page.getByRole('status').filter({ hasText: '已暂缓' }).waitFor();
  await page.keyboard.press('Escape'); assert.equal(await page.locator('dialog').count(), 0);
  await page.getByRole('button', { name: '版本更新', exact: true }).click();
  await page.getByRole('button', { name: '检查更新', exact: true }).click();
  await page.getByRole('button', { name: '下载此平台安装包' }).click();
  await page.getByRole('status').filter({ hasText: '浏览器' }).waitFor();
  await page.evaluate(() => { window.failAction = true; });
  await page.getByRole('button', { name: '忽略此版本' }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.evaluate(() => window.updateState.suppressed), 'snoozed');
  await page.evaluate(() => { window.failAction = false; });
  await page.getByRole('button', { name: '忽略此版本' }).click();
  await page.getByRole('status').filter({ hasText: '已忽略' }).waitFor();
  const output = fileURLToPath(new URL('../../../outputs/community-updates/', import.meta.url)); await mkdir(output, { recursive: true });
  await page.emulateMedia({ colorScheme: 'dark' }); await page.screenshot({ path: join(output, 'updates-dark.png') });
  await page.emulateMedia({ colorScheme: 'light' }); await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(output, 'updates-narrow.png') });
  assert(await page.locator('dialog').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.emitUpdate({ openRequest: 1 }));
  await page.getByRole('dialog').waitFor();
  await page.evaluate(() => document.documentElement.lang = 'en');
  await page.getByRole('button', { name: 'Close update details' }).click();
  await page.evaluate(() => window.emitUpdate({ phase: 'error', release: null }));
  assert.equal(await page.locator('dialog').count(), 0, 'network errors must not interrupt');
  await page.getByRole('button', { name: 'Version updates', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Could not check' }).waitFor();
  assert.deepEqual(errors, []);
  assert((await page.evaluate(() => window.calls)).some(c => c.action === 'download' && c.version === '0.2.1-rc.3-community.7'));
  console.log('PASS update panel: passive notice, StrictMode, snooze, manual check, download, failed save, ignore, Escape, native menu, locales, dark/narrow layout.');
} finally { if (browser) await browser.close(); server.closeAllConnections(); await new Promise(r => server.close(r)); }
