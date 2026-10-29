import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

import { settingsFrom, parseDecision } from './companion-contract.mjs';
export { DEFAULT_SETTINGS, ACTIONS, settingsFrom, parseDecision } from './companion-contract.mjs';
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const dayKey = timestamp => { const d = new Date(timestamp); return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`; };

/** One host owns persistence, budget reservations and cancellation for the cloud bunny. */
export class CompanionService {
  constructor({ file, generate, environment, now = Date.now, timeoutMs = 55000 }) {
    this.file = file; this.generate = generate; this.environment = environment; this.now = now; this.timeoutMs = timeoutMs;
    this.queue = Promise.resolve(); this.pending = null; this.epoch = 0; this.lastDecision = null; this.disposed = false;
    this.ready = this.load();
    // Reads surface the error; initialization must not create an unhandled rejection.
    this.ready.catch(() => {});
  }
  async load() {
    let raw;
    try { raw = JSON.parse(await readFile(this.file, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('陪伴数据无法读取，请检查数据文件后重试'); }
    if (raw && (raw.version !== 1 || !object(raw.usage) || !Array.isArray(raw.history))) throw new Error('陪伴数据版本或格式不正确');
    const usage = raw?.usage ?? { day: dayKey(this.now()), calls: 0, lastAuto: 0, lastCall: 0 };
    if (typeof usage.day !== 'string' || !Number.isInteger(usage.calls) || usage.calls < 0 || !Number.isFinite(usage.lastAuto) || !Number.isFinite(usage.lastCall)) throw new Error('陪伴用量记录损坏');
    const history = raw?.history ?? [];
    if (history.some(m => !object(m) || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || m.content.length > 1000)) throw new Error('陪伴记忆格式不正确');
    this.data = { version: 1, settings: settingsFrom(raw?.settings), usage, history: history.slice(-10) };
  }
  serial(fn) { const next = this.queue.then(async () => { await this.ready; return fn(); }); this.queue = next.catch(() => {}); return next; }
  async persist(next) {
    await mkdir(dirname(this.file), { recursive: true });
    const temp = this.file + '.' + randomUUID() + '.tmp';
    try { await writeFile(temp, JSON.stringify(next, null, 2), { mode: 0o600 }); await rename(temp, this.file); }
    finally { await rm(temp, { force: true }); }
    this.data = next;
  }
  snapshot() {
    const { settings, usage, history } = this.data;
    return { settings, usage: { ...usage, calls: usage.day === dayKey(this.now()) ? usage.calls : 0 }, history,
      decision: this.lastDecision && this.lastDecision.expiresAt > this.now() ? this.lastDecision : null, pending: !!this.pending };
  }
  get() { return this.serial(() => this.snapshot()); }
  cancel() { this.epoch++; this.pending?.controller.abort(); this.pending = null; this.lastDecision = null; }
  update(value) {
    // Cancel immediately, even when a disk write is queued.
    this.cancel();
    return this.serial(async () => {
      this.cancel();
      if (!object(value)) throw new Error('陪伴设置格式不正确');
      const settings = settingsFrom({ ...this.data.settings, ...value });
      await this.persist({ ...this.data, settings });
      return this.snapshot();
    });
  }
  clearMemory() {
    this.cancel();
    return this.serial(async () => {
      this.cancel();
      await this.persist({ ...this.data, settings: { ...this.data.settings, nickname: '', preferences: '' }, history: [] });
      return this.snapshot();
    });
  }
  dispose() { this.disposed = true; this.cancel(); }
  async think(input = {}, externalSignal) {
    const trigger = input.trigger;
    if (!['idle', 'touch', 'return', 'chat'].includes(trigger)) throw new Error('未知的陪伴事件');
    const manual = trigger === 'chat';
    if (manual && (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 1000)) throw new Error('请输入 1–1000 字的聊天内容');
    const reserved = await this.serial(async () => {
      const s = this.data.settings, env = this.environment(), now = this.now(), epoch = this.epoch;
      const skip = reason => ({ ok: false, reason });
      if (this.disposed || externalSignal?.aborted || !s.enabled || !env.visible) return skip('disabled');
      if (!manual && (env.busy || s.activity === 'quiet')) return skip('quiet');
      if (this.pending) return skip('busy');
      const usage = { ...this.data.usage };
      if (usage.day !== dayKey(now)) { usage.day = dayKey(now); usage.calls = 0; }
      if (usage.calls >= s.dailyLimit) return skip('daily-limit');
      if ((usage.lastCall && now - usage.lastCall < 5000) || (!manual && usage.lastAuto && now - usage.lastAuto < 600000)) return skip('cooldown');
      usage.calls++; usage.lastCall = now; if (!manual) usage.lastAuto = now;
      // Reserve before the network call, including failed requests; restart cannot reset the cap.
      await this.persist({ ...this.data, usage });
      if (epoch !== this.epoch || this.disposed) return skip('cancelled');
      const job = { controller: new AbortController(), epoch: this.epoch, settings: { ...s }, history: this.data.history.slice(), manual };
      this.pending = job;
      return job;
    });
    if (!reserved.controller) return reserved;
    const job = reserved;
    const signal = AbortSignal.any([job.controller.signal, AbortSignal.timeout(this.timeoutMs), ...(externalSignal ? [externalSignal] : [])]);
    let abort;
    const cancelled = new Promise((_, reject) => {
      abort = () => reject(new Error('请求已取消或超时'));
      if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
    });
    try {
      const response = await Promise.race([this.generate({ settings: job.settings, history: job.history, trigger, text: manual ? input.text.trim() : '', signal }), cancelled]);
      const decision = parseDecision(response);
      return await this.serial(async () => {
        const env = this.environment();
        if (this.disposed || job.epoch !== this.epoch || signal.aborted || !env.visible || (!manual && env.busy)) return { ok: false, reason: 'cancelled' };
        if (manual) await this.persist({ ...this.data, history: [...this.data.history, { role: 'user', content: input.text.trim() }, { role: 'assistant', content: decision.text }].slice(-10) });
        if (job.epoch !== this.epoch || signal.aborted || this.disposed) return { ok: false, reason: 'cancelled' };
        this.lastDecision = { ...decision, id: randomUUID(), expiresAt: this.now() + 15000 };
        return { ok: true, decision: this.lastDecision };
      });
    } catch (error) {
      return { ok: false, reason: signal.aborted ? 'cancelled' : 'model-error', message: signal.aborted ? '请求已取消或超时，本地动作继续运行' : 'AI 暂时无法回应，请检查所选模型；本地动作继续运行' };
    } finally {
      signal.removeEventListener('abort', abort);
      if (this.pending === job) this.pending = null;
    }
  }
}
