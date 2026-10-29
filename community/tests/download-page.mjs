import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
import { detectPlatform, qualifiedReleases } from '../site/release-platform.js';

const { chromium } = createRequire(new URL('../../apps/web/package.json', import.meta.url))('playwright');
const root = fileURLToPath(new URL('../site/', import.meta.url));
const manifest = JSON.parse(await readFile(resolve(root, 'releases.json'), 'utf8'));
const output = resolve(process.argv[2] || '../outputs/DSH-TuZi-platform-downloads');
await mkdir(output, { recursive: true });
const mac = manifest.releases.find(entry => entry.platform === 'macOS');
const windows = manifest.releases.find(entry => entry.platform === 'Windows' && entry.arch === 'x64') || { ...mac, platform: 'Windows', arch: 'x64', url: 'https://github.com/AiW520/DSH-TuZi/releases/download/test/dsh-tuzi-test.exe' };
assert.equal(detectPlatform({ userAgent: 'Windows NT 10.0; Win64; x64' }), 'Windows');
assert.equal(detectPlatform({ userAgent: 'Mozilla Macintosh', platform: 'MacIntel', maxTouchPoints: 5 }), 'mobile');
assert.equal(detectPlatform({ userAgent: 'Linux Android', platform: 'Linux' }), 'mobile');
assert.equal(detectPlatform({ userAgent: 'Macintosh Intel Mac OS X', platform: 'MacIntel' }), 'macOS');
assert.equal(detectPlatform({ userAgent: '', userAgentData: { platform: 'Windows' } }), 'Windows');
assert.equal(qualifiedReleases({ schemaVersion: 1, releases: [{ ...windows, url: mac.url }] }).length, 0, 'a Windows label must not point to a DMG');
assert.equal(qualifiedReleases({ schemaVersion: 1, releases: [{ ...windows, qualified: false }] }).length, 0);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.webm': 'video/webm' };
const server = createServer(async (req, res) => {
  const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
  if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) { res.writeHead(403).end(); return; }
  try { res.setHeader('content-type', mime[extname(path)] || 'application/octet-stream'); res.end(await readFile(path)); }
  catch { res.writeHead(404).end(); }
});
let browser;
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  browser = await chromium.launch({ headless: true, ...(process.env.DSH_TEST_BROWSER_CHANNEL ? { channel: process.env.DSH_TEST_BROWSER_CHANNEL } : {}) });
  const visit = async (platform, ua, releases = manifest.releases, mobile = false, manifestRoute) => {
    const context = await browser.newContext({ userAgent: ua, viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 } });
    await context.addInitScript(({ platform, mobile }) => {
      Object.defineProperty(navigator, 'userAgentData', { value: undefined });
      Object.defineProperty(navigator, 'platform', { value: platform });
      Object.defineProperty(navigator, 'maxTouchPoints', { value: mobile ? 5 : 0 });
    }, { platform, mobile });
    const page = await context.newPage();
    await page.route('**/releases.json', manifestRoute || (route => route.fulfill({ json: { schemaVersion: 1, releases } })));
    await page.goto(`http://127.0.0.1:${server.address().port}/#download`);
    await page.waitForFunction(() => document.getElementById('release-status').textContent !== '加载版本信息');
    return { page, context };
  };
  let { page, context } = await visit('Win32', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', [mac]);
  assert.equal(await page.locator('#release-system').inputValue(), 'Windows');
  assert.equal(await page.locator('#release-status').textContent(), '暂未发布');
  assert.equal(await page.locator('#release-list a.primary').count(), 0);
  await page.locator('.release-panel').screenshot({ path: resolve(output, 'windows-unavailable.png') });
  await page.selectOption('#release-system', 'macOS');
  assert.match(await page.locator('#release-list a.primary').getAttribute('href'), /\.dmg$/);
  await page.selectOption('#release-architecture', 'x64');
  assert.equal(await page.locator('#release-list a.primary').count(), 0, 'Intel Mac must not receive Apple Silicon installer');
  await context.close();
  ({ page, context } = await visit('Win32', 'Windows NT 10.0', [mac, windows]));
  assert.equal(await page.locator('#release-list a.primary').count(), 1);
  assert.match(await page.locator('#release-list a.primary').getAttribute('href'), /\.exe$/);
  assert.match(await page.locator('#release-list').textContent(), /未签名/);
  await page.locator('.download-help > summary').click();
  await page.locator('.download-advanced > summary').click();
  assert.match(await page.getByRole('textbox', { name: '续传命令内容' }).inputValue(), /curl\.exe/);
  assert.match(await page.getByRole('textbox', { name: '续传命令内容' }).inputValue(), /Get-FileHash/);
  // Permission failure must retain the full command for manual copying.
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('denied'); } }, configurable: true }));
  await page.getByRole('button', { name: '复制续传命令' }).click();
  await page.getByText('请复制已选中的内容').waitFor();
  assert.equal(await page.getByRole('textbox', { name: '续传命令内容' }).evaluate(el => el.selectionEnd - el.selectionStart), (await page.getByRole('textbox', { name: '续传命令内容' }).inputValue()).length);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.copiedDownload = text; } }, configurable: true }));
  await page.getByRole('button', { name: '复制下载链接' }).click();
  await page.getByText('已复制', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.copiedDownload), windows.url);
  await context.route(windows.url, route => route.abort());
  await page.locator('#release-list a.primary').click();
  await page.getByText(/此页面无法读取下载进度/).waitFor();
  await page.locator('.download-advanced > summary').click();
  await page.locator('.release-panel').screenshot({ path: resolve(output, 'windows-available.png') });
  await page.selectOption('#release-architecture', 'arm64');
  assert.equal(await page.locator('#release-list a.primary').count(), 0);
  await page.selectOption('#release-system', 'Linux');
  assert.equal(await page.locator('#release-status').textContent(), '暂未发布');
  await context.close();
  ({ page, context } = await visit('MacIntel', 'Mozilla/5.0 Macintosh'));
  assert.equal(await page.locator('#release-system').inputValue(), 'macOS');
  await page.locator('.download-help > summary').click();
  await page.locator('.download-advanced > summary').click();
  assert.match(await page.getByRole('textbox', { name: '续传命令内容' }).inputValue(), /shasum -a 256/);
  assert.doesNotMatch(await page.getByRole('textbox', { name: '续传命令内容' }).inputValue(), /curl\.exe/);
  await page.locator('.download-advanced > summary').click();
  await page.locator('.release-panel').screenshot({ path: resolve(output, 'macos.png') });
  await context.close();
  ({ page, context } = await visit('iPhone', 'Mozilla/5.0 iPhone', [mac], true));
  assert.equal(await page.locator('#release-list a.primary').count(), 0);
  assert.equal(await page.locator('#release-system').inputValue(), '');
  await page.selectOption('#release-system', 'Windows');
  assert.equal(await page.locator('#release-list a.primary').count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.locator('.release-panel').screenshot({ path: resolve(output, 'mobile.png') });
  await context.close();
  ({ page, context } = await visit('', 'UnknownBrowser', []));
  assert.equal(await page.locator('#release-system').inputValue(), '');
  await page.unroute('**/releases.json');
  await page.route('**/releases.json', route => route.fulfill({ status: 503, body: 'unavailable' }));
  await page.reload();
  await page.waitForFunction(() => document.getElementById('release-status').textContent === '下载信息暂不可用');
  assert.equal(await page.locator('#release-list a.primary').count(), 0);
  assert(await page.getByRole('link', { name: /版本说明与已知限制/ }).count());
  await context.close();
  let attempts = 0;
  ({ page, context } = await visit('Win32', 'Windows NT 10.0', [windows], false, route => {
    attempts++;
    return attempts < 3 ? route.fulfill({ status: 503, body: 'unavailable' }) : route.fulfill({ json: { schemaVersion: 1, releases: [windows] } });
  }));
  assert.equal(attempts, 3);
  assert.match(await page.locator('#release-list a.primary').getAttribute('href'), /\.exe$/);
  await context.close();
  attempts = 0;
  ({ page, context } = await visit('Win32', 'Windows NT 10.0', [windows], false, route => {
    attempts++;
    return route.fulfill({ status: 503, body: 'unavailable' });
  }));
  assert.equal(attempts, 3);
  await page.unroute('**/releases.json');
  await page.route('**/releases.json', route => route.fulfill({ json: { schemaVersion: 1, releases: [windows] } }));
  await page.getByRole('button', { name: '重新加载版本信息' }).click();
  await page.waitForFunction(() => document.getElementById('release-status').textContent === 'Windows 可下载');
  await context.close();
  ({ page, context } = await visit('iPhone', 'iPhone', [windows], true));
  await page.selectOption('#release-system', 'Windows');
  await page.locator('.download-help > summary').click();
  await page.locator('.download-advanced > summary').click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.locator('.release-panel').screenshot({ path: resolve(output, 'mobile-recovery.png') });
  await context.close();
  console.log('PASS retry recovery/exhaustion/manual reload, clipboard success/denial, platform commands, honest download feedback, mobile expanded help.');
  console.log('PASS Windows unavailable/EXE, macOS/Intel, Linux, mobile, unknown OS, manual switching, unavailable manifest, artifact type validation, mobile overflow.');
} finally {
  try { if (browser) await browser.close(); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
