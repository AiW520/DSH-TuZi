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
const evidence = await mkdtemp(join(process.env.DSH_COMMUNITY_EVIDENCE_DIR || tmpdir(), 'dsh-pet-interactions-'));
const conf = JSON.parse(await readFile(new URL('../pet/assets/config.jsonc', import.meta.url), 'utf8'));
conf.pets[0].position = { corner: 'bottom-left', marginX: 160, marginY: 180 };
let companionSettings = { enabled: false, activity: 'balanced' };
let companionDecision = null;
let counter = 1;
let work = { state: 'working', task: '正在验收桌宠互动' };
const routes = [];
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  routes.push(path);
  const json = value => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(value)); };
  if (path.endsWith('/companion')) return json({ settings: companionSettings, decision: companionDecision });
  if (path.endsWith('/companion/chat')) { req.resume(); companionDecision = { id: 'desktop-chat', action: 'wave', mood: 'happy', text: '收到你的桌面聊天啦', expiresAt: Date.now()+15000 }; return json({ok:true}); }
  if (path.endsWith('/config')) return json({ main: conf });
  if (path.endsWith('/state')) return json({ sections: { menu: { counter: 0, data: [] }, workStatus: { counter, data: work } }, pets: {} });
  if (path.includes('/thumb/')) {
    const name = path.split('/').pop();
    if (['idle','thinking','working','waiting','happy','error','drag','nap','stretch','wave'].some(s => name === s + '.webm')) {
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
  await app.evaluate(({ powerMonitor }) => { powerMonitor.getSystemIdleTime = () => 0; });
  const page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForFunction(() => window.__dshPetDebug?.configOk && typeof sprites !== 'undefined' && sprites[0]?.companion?.ready, {}, { timeout: 20000 });
  await page.waitForFunction(() => sprites[0].workState === 'working', {}, { timeout: 5000 });
  await page.waitForFunction(() => !sprites[0].pending && document.querySelector('.pet-video.is-front')?.readyState >= 2);
  const originalGeneration = await page.evaluate(() => sprites[0].gen);
  work = { state: 'working', task: '同一状态只更新任务文字' }; counter++;
  await page.waitForFunction(() => sprites[0].workText === '同一状态只更新任务文字');
  assert.equal(await page.evaluate(() => sprites[0].gen), originalGeneration, 'task text updates must not reload the video');
  await page.evaluate(() => {
    window.__blankFrames = 0;
    const sample = () => {
      const visible = [...document.querySelectorAll('.pet-video')].filter(v => getComputedStyle(v).opacity === '1' && v.readyState >= 2);
      if (!visible.length) window.__blankFrames++;
      window.__sampleFrame = requestAnimationFrame(sample);
    };
    sample();
    for (let i = 0; i < 20; i++) sprites[0].switchTo(i % 2 ? 'waiting' : 'thinking', false);
    sprites[0].switchTo('working', false);
  });
  await page.waitForFunction(() => !sprites[0].pending && document.querySelector('.pet-video.is-front')?.currentSrc.endsWith('/working.webm'));
  await page.evaluate(() => cancelAnimationFrame(window.__sampleFrame));
  assert.equal(await page.evaluate(() => window.__blankFrames), 0, 'rapid switches retain a decoded frame');
  const setWork = async state => {
    work = { state, task: state ? '正在验收桌宠互动' : null }; counter++;
    await page.waitForFunction(state => sprites[0].workState === state, state, { timeout: 6000 });
  };
  const position = await page.evaluate(() => ({ ...sprites[0].pos }));
  for (const [state, animation] of [['thinking', 'thinking'], ['waiting', 'waiting'], ['success', 'happy'], ['error', 'error'], ['working', 'working']]) {
    await setWork(state);
    await page.waitForFunction(animation => !sprites[0].pending && sprites[0].motion.dataset.animation === animation, animation);
    assert.equal(await page.evaluate(() => sprites[0].motion.getAnimations().some(a => a.playState === 'running')), true);
    await page.screenshot({ path: join(evidence, state + '.png') });
  }
  await page.locator('.pet-hit').click();
  await page.waitForFunction(() => document.querySelector('.pet-art').getAnimations().some(a => a.playState === 'running'));
  assert.equal(await page.evaluate(() => sprites[0].workState), 'working');
  assert.equal(await page.evaluate(() => sprites[0].whisperOn), false, 'a greeting must not cover active task status');
  await page.waitForFunction(() => !document.querySelector('.pet-art').dataset.reaction);
  assert.deepEqual(await page.evaluate(() => ({ ...sprites[0].pos })), position, 'hopping must preserve desktop placement');
  await setWork(null);
  await page.waitForFunction(() => sprites[0].anim === 'idle', {}, { timeout: 6000 });
  await page.waitForFunction(() => document.querySelector('.pet-blink').classList.contains('is-blinking'), {}, { timeout: 10000 });
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.pet-video.is-front')).visibility), 'visible', 'blinking must not hide the body');
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
  await page.waitForFunction(() => !sprites[0].pending);
  for (const action of ['stretch', 'wave', 'nap', 'stroll', 'tilt']) {
    assert.equal(await page.evaluate(action => sprites[0].companion.life.perform(action), action), true, action + ': ' + JSON.stringify(await page.evaluate(() => ({away:sprites[0].companion.life.away, paused:sprites[0].companion.life.presencePaused, canReact:sprites[0].companion.canReact(), move:sprites[0].moveRef, chat:sprites[0].chatOpen, work:sprites[0].workState}))));
    if (['stretch','wave','nap'].includes(action)) {
      await page.waitForFunction(action => !sprites[0].pending && sprites[0].motion.dataset.animation === action, action);
      await page.screenshot({ path: join(evidence, 'life-' + action + '.png') });
    } else assert.equal(await page.evaluate(() => !!sprites[0].companion.reaction), true);
  }
  await setWork('working');
  assert.equal(await page.evaluate(() => sprites[0].companion.life.actionTimer), null, 'tasks cancel autonomous poses');
  assert.equal(await page.evaluate(() => sprites[0].companion.life.perform('wave')), false, 'autonomy does not override tasks');
  await setWork(null);
  await page.waitForFunction(() => !sprites[0].pending);
  await app.evaluate(({ powerMonitor }) => { powerMonitor.getSystemIdleTime = () => 301; });
  await page.waitForFunction(() => sprites[0].companion.life.away && sprites[0].motion.dataset.animation === 'nap', {}, {timeout:12000});
  await page.waitForFunction(() => sprites[0].companion.life.actionTimer === null, {}, {timeout:17000});
  assert.equal(await page.evaluate(() => sprites[0].motion.dataset.animation), 'nap', 'remain asleep while user is away');
  await app.evaluate(({ powerMonitor }) => { powerMonitor.getSystemIdleTime = () => 0; });
  await page.waitForFunction(() => sprites[0].motion.dataset.animation === 'wave', {}, {timeout:12000});
  await app.evaluate(({ powerMonitor }) => powerMonitor.emit('lock-screen'));
  await page.waitForFunction(() => sprites[0].companion.life.presencePaused, {}, {timeout:12000});
  assert.equal(await page.evaluate(() => sprites[0].companion.life.perform('hop')), false, 'lock screen pauses autonomy');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('video')].every(v=>v.paused)), true);
  await app.evaluate(({ powerMonitor }) => powerMonitor.emit('unlock-screen'));
  await page.waitForFunction(() => !sprites[0].companion.life.presencePaused, {}, {timeout:12000});
  await page.evaluate(() => sprites[0].companion.life.consume({ id:'new-decision',action:'wave',mood:'happy',text:'AI动作测试',expiresAt:Date.now()+10000 }));
  await page.waitForFunction(() => sprites[0].motion.dataset.animation === 'wave');
  assert.equal(await page.evaluate(() => sprites[0].el.dataset.mood), 'happy');
  await setWork('thinking'); await setWork(null);
  await page.waitForFunction(() => !sprites[0].pending);
  await page.locator('.pet-hit').click({ button: 'right' });
  await page.getByText('减少动作', { exact: true }).click();
  assert.equal(await page.evaluate(() => sprites[0].companion.quiet), true);
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('video')].every(v => v.paused)), true);
  assert.equal(await page.evaluate(() => sprites[0].motion.getAnimations().length), 0, 'reduced motion also stops CSS movement');
  await page.locator('.pet-hit').click({ button: 'right' });
  await page.getByText('对话', { exact:true }).click();
  await page.locator('.dsh-pet-chat-input').fill('安静地聊一句');
  await page.locator('.dsh-pet-chat-input').press('Enter');
  await page.getByText('收到你的桌面聊天啦', {exact:true}).waitFor();
  assert(routes.includes('/dsh-pet-7340/companion/chat'));
  assert(!routes.includes('/dsh-pet-7340/chat'), 'desktop companion must use its own enabled flag and budget');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('video')].every(v=>v.paused)), true, 'quiet chat shows text without animation');
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
  console.log('PASS desktop helper: current task on launch, click hop without changing task/position, natural and menu blink, menu hop, quiet persistence/chat, local poses, away/return, lock/unlock, task interruption, keyboard, reduced motion, disposal.');
} finally {
  if (app) await app.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await writeFile(join(evidence, 'launch.log'), log);
  await writeFile(join(evidence, 'report.json'), JSON.stringify({ errors, routes }, null, 2));
  console.log('EVIDENCE', evidence);
}
