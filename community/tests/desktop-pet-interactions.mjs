import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const { _electron } = createRequire(new URL('../../apps/web/package.json', import.meta.url))('playwright');
const executablePath = process.argv[2];
if (!executablePath) throw new Error('Pass an Electron executable, or an installed DSH-TuZi executable followed by --installed');
const installed = process.argv.includes('--installed');
const evidence = await mkdtemp(join(tmpdir(), 'dsh-pet-interactions-'));
const conf = JSON.parse(await readFile(new URL('../pet/assets/config.jsonc', import.meta.url), 'utf8'));
conf.pets[0].position = { corner: 'bottom-left', marginX: 160, marginY: 180 };
let counter = 1;
let work = { state: 'working', task: '正在验收桌宠互动' };
const routes = [];
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  routes.push(path);
  const json = value => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(value)); };
  if (path.endsWith('/config')) return json({ main: conf });
  if (path.endsWith('/state')) return json({ sections: { menu: { counter: 0, data: [] }, workStatus: { counter, data: work } }, pets: {} });
  if (path.includes('/thumb/')) {
    const name = path.split('/').pop();
    if (['idle','thinking','working','waiting','happy','error','drag'].some(s => name === s + '.webm')) {
      try {
        res.setHeader('content-type', 'video/webm');
        res.end(await readFile(new URL('../pet/assets/webm/' + name, import.meta.url)));
      } catch (error) { res.statusCode = 500; res.end(String(error)); }
      return;
    }
  }
  if (req.method === 'POST') { req.resume(); return json({ ok: true }); }
  res.statusCode = 404; res.end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const configUrl = `http://127.0.0.1:${server.address().port}/dsh-pet-7340/config`;
let app;
let log = '';
const errors = [];
try {
  app = await _electron.launch({
    executablePath,
    args: [...(installed ? [] : [resolve('community/pet/runtime/electron-helper/main.js')]), '--user-data-dir=' + join(evidence, 'profile')],
    env: { ...process.env, DSH_TUZI_PET_HELPER: '1', DSH_PET_FORCE_DSF: '0', DSH_PET_BRIDGE: '0', DSH_PET_SMOKE: '0',
      DSH_PET_CONFIG_URL: configUrl, DSH_PET_PETS: JSON.stringify([{ id: 'cloud-bunny', size: 320 }]), DSH_PET_OPEN_TARGET: 'desktop' },
    timeout: 60000,
  });
  app.process().stderr.on('data', data => { log += data; });
  app.process().stdout.on('data', data => { log += data; });
  const page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForFunction(() => window.__dshPetDebug?.configOk && typeof sprites !== 'undefined' && sprites[0]?.companion?.ready, {}, { timeout: 20000 });
  await page.waitForFunction(() => sprites[0].workState === 'working', {}, { timeout: 5000 });
  const setWork = async state => {
    work = { state, task: state ? '正在验收桌宠互动' : null }; counter++;
    await page.waitForFunction(state => sprites[0].workState === state, state, { timeout: 6000 });
  };
  const position = await page.evaluate(() => ({ ...sprites[0].pos }));
  await page.locator('.pet-hit').click();
  await page.waitForFunction(() => document.querySelector('.pet-art').getAnimations().some(a => a.playState === 'running'));
  assert.equal(await page.evaluate(() => sprites[0].workState), 'working');
  assert.equal(await page.evaluate(() => sprites[0].whisperOn), false, 'a greeting must not cover active task status');
  await page.waitForFunction(() => !document.querySelector('.pet-art').dataset.reaction);
  assert.deepEqual(await page.evaluate(() => ({ ...sprites[0].pos })), position, 'hopping must preserve desktop placement');
  await setWork(null);
  await page.waitForFunction(() => sprites[0].anim === 'idle', {}, { timeout: 6000 });
  await page.waitForFunction(() => document.querySelector('.pet-blink').classList.contains('is-blinking'), {}, { timeout: 10000 });
  await page.screenshot({ path: join(evidence, 'blink.png') });
  await page.waitForFunction(() => !document.querySelector('.pet-blink').classList.contains('is-blinking'));
  await page.locator('.pet-hit').click({ button: 'right' });
  await page.getByText('和云朵兔玩', { exact: true }).hover();
  await page.getByText('开心跳一下', { exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.pet-art').dataset.reaction === 'hop');
  await page.waitForFunction(() => !document.querySelector('.pet-art').dataset.reaction);
  await page.locator('.pet-hit').click({ button: 'right' });
  await page.getByText('和云朵兔玩', { exact: true }).hover();
  await page.getByText('眨眨眼', { exact: true }).click();
  assert.equal(await page.evaluate(() => document.querySelector('.pet-blink').classList.contains('is-blinking')), true);
  await setWork('waiting');
  assert.equal(await page.evaluate(() => sprites[0].whisperOn), false, 'a new task immediately replaces the local greeting');
  await setWork(null);
  await page.locator('.pet-hit').click({ button: 'right' });
  await page.getByText('减少动作', { exact: true }).click();
  assert.equal(await page.evaluate(() => sprites[0].companion.quiet), true);
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('video')].every(v => v.paused)), true);
  await setWork('thinking');
  await page.waitForFunction(() => document.querySelector('.pet-video.is-front').currentSrc.endsWith('/thinking.webm'));
  assert.equal(await page.evaluate(() => document.querySelector('.pet-video.is-front').paused), true);
  await setWork(null);
  await page.waitForFunction(() => document.querySelector('.pet-video.is-front').currentSrc.endsWith('/idle.webm'));
  await page.reload();
  await page.waitForFunction(() => window.__dshPetDebug?.configOk && typeof sprites !== 'undefined' && sprites[0]?.companion?.ready);
  assert.equal(await page.evaluate(() => sprites[0].companion.quiet), true, 'quiet preference survives helper reload');
  await page.locator('.pet-hit').click({ button: 'right' });
  await page.getByText('恢复活泼动作', { exact: true }).click();
  await page.locator('.pet-hit').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('.pet-art').dataset.reaction === 'hop');
  const box = await page.locator('.pet-hit').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  assert.equal(await page.evaluate(() => sprites[0].companion.reaction), null, 'pointer down cancels hopping before drag');
  await page.mouse.move(box.x + box.width / 2 + 35, box.y + box.height / 2 + 20, { steps: 8 });
  await page.mouse.up();
  await page.evaluate(() => { sprites[0].stopThrow(); sprites[0].stopMove(); sprites[0].applyFreeze(true); sprites[0].companion.react('hop'); });
  assert.equal(await page.evaluate(() => sprites[0].companion.reaction), null, 'frozen pets do not react');
  await page.evaluate(() => sprites[0].applyFreeze(false));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => sprites[0].el.dataset.quiet === 'true' && !document.querySelector('.pet-art').dataset.reaction);
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('video')].every(v => v.paused)), true);
  await page.screenshot({ path: join(evidence, 'desktop.png') });
  assert.deepEqual(errors, []);
  assert.deepEqual(await page.evaluate(() => window.__dshPetDebug.errors), []);
  await page.evaluate(() => {
    const companion = sprites[0].companion;
    sprites[0].dispose();
    window.__disposedCompanion = { disposed: companion.disposed, idleTimer: companion.idleTimer, blinkTimer: companion.blinkTimer, reaction: companion.reaction };
  });
  assert.deepEqual(await page.evaluate(() => window.__disposedCompanion), { disposed: true, idleTimer: null, blinkTimer: null, reaction: null });
  console.log('PASS desktop helper: current task on launch, click hop without changing task/position, natural and menu blink, menu hop, quiet persistence, quiet cancellation, keyboard, reduced motion, disposal.');
} finally {
  if (app) await app.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await writeFile(join(evidence, 'launch.log'), log);
  await writeFile(join(evidence, 'report.json'), JSON.stringify({ errors, routes }, null, 2));
  console.log('EVIDENCE', evidence);
}
