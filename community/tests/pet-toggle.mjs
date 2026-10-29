import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const { chromium } = require('playwright');
const { build } = createRequire(require.resolve('tsx/package.json'))('esbuild');
const component = fileURLToPath(new URL('../brand/pet-toggle.jsx', import.meta.url));
const bundle = await build({
  stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {PetToggle} from ${JSON.stringify(component)}; createRoot(document.getElementById('root')).render(<React.StrictMode><PetToggle wide /></React.StrictMode>);`, loader: 'jsx', resolveDir: fileURLToPath(new URL('../../apps/web/', import.meta.url)) },
  bundle: true, platform: 'browser', write: false, format: 'iife', alias: { react: require.resolve('react') },
});
let display = 'desktop';
let failWrite = false;
let writes = 0;
const server = createServer(async (req, res) => {
  if (req.url === '/app.js') { res.setHeader('content-type', 'text/javascript'); res.end(bundle.outputFiles[0].text); return; }
  if (req.url.startsWith('/dsh-pet-7340/')) {
    res.setHeader('content-type', 'application/json');
    if (req.method === 'POST') {
      let body = ''; for await (const chunk of req) body += chunk;
      writes++;
      if (failWrite) { res.end(JSON.stringify({ ok: false, reason: 'write-failed' })); return; }
      const value = JSON.parse(body);
      assert.equal(value.id, 'cloud-bunny');
      display = value.display;
    }
    res.end(JSON.stringify({ main: { pets: [{ id: 'cloud-bunny', display }] } })); return;
  }
  res.setHeader('content-type', 'text/html');
  res.end('<!doctype html><div id="root"></div><script src="/app.js"></script>');
});
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ channel: process.env.DSH_TEST_BROWSER_CHANNEL || 'chrome', headless: true });
  const page = await browser.newPage({ locale: 'zh-CN' });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.getByRole('button', { name: '关闭桌面云朵兔' }).click();
  await page.getByRole('button', { name: '开启桌面云朵兔' }).waitFor();
  assert.equal(display, 'none');
  assert.equal(writes, 1);
  await page.reload();
  await page.getByRole('button', { name: '开启桌面云朵兔' }).click();
  await page.getByRole('button', { name: '关闭桌面云朵兔' }).waitFor();
  assert.equal(display, 'desktop');
  failWrite = true;
  await page.getByRole('button', { name: '关闭桌面云朵兔' }).click();
  await page.getByRole('button', { name: '保存失败，请重试' }).waitFor();
  assert.equal(await page.getByRole('button', { name: '保存失败，请重试' }).getAttribute('aria-pressed'), 'true');
  assert.equal(display, 'desktop');
  failWrite = false;
  await page.getByRole('button', { name: '保存失败，请重试' }).click();
  await page.getByRole('button', { name: '关闭桌面云朵兔' }).waitFor();
  display = 'both';
  await page.reload();
  await page.getByRole('button', { name: '关闭桌面云朵兔' }).click();
  await page.getByRole('button', { name: '开启桌面云朵兔' }).waitFor();
  assert.equal(display, 'web', 'hiding the desktop pet preserves a separately configured web pet');
  await page.getByRole('button', { name: '开启桌面云朵兔' }).click();
  await page.getByRole('button', { name: '关闭桌面云朵兔' }).waitFor();
  assert.equal(display, 'both');
  assert.deepEqual(errors, []);
  console.log('PASS sidebar visibility: Strict Mode cleanup, hide/show persistence, failed write, recovery, independent web display.');
} finally {
  if (browser) await browser.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
