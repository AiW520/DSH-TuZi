'use strict';

/** Local activity continues independently of model latency. All AI calls are host-budgeted. */
class CloudBunnyLife {
  constructor(companion) {
    this.c = companion; this.s = companion.sprite; this.disposed = false;
    this.settings = { enabled: false, activity: 'balanced' };
    this.lastDecision = null; this.loaded = false; this.request = null; this.poll = null;
    this.actionTimer = null; this.tickTimer = null; this.touchTimer = null;
    this.nextActionAt = Date.now() + 20000; this.nextAIAt = Date.now() + 60000;
    this.away = false; this.presencePaused = false; this.lastAction = '';
    void this.tick();
  }
  async json(path, options = {}, signal) {
    const response = await fetch(BASE + '/companion' + path, { cache: 'no-store', ...options, signal });
    if (!response.ok) throw new Error('Companion unavailable');
    return response.json();
  }
  cancelVisual() { clearTimeout(this.actionTimer); this.actionTimer = null; this.s.el.removeAttribute('data-life'); }
  cancelRequest() {
    clearTimeout(this.touchTimer); this.touchTimer = null;
    if (!this.request) return;
    this.request.abort(); this.request = null;
    this.json('/cancel', { method: 'POST' }, AbortSignal.timeout(3000)).catch(() => {});
  }
  ready() { return !this.disposed && !this.presencePaused && !this.away && !this.s.workState && this.c.canReact(); }
  perform(action) {
    if (!this.ready()) return false;
    this.c.cancelEffects();
    this.lastAction = action;
    if (action === 'blink') { this.c.blink(); return true; }
    if (action === 'hop') { this.c.hop(); return true; }
    if (['nap', 'wave', 'stretch'].includes(action)) {
      this.s.anim = action;
      this.s.switchTo(action, false);
      this.s.el.dataset.life = action;
      this.actionTimer = setTimeout(() => {
        this.actionTimer = null;
        if (!this.disposed && !this.away && !this.s.workState && !this.s.frozen) this.s.playIdle();
      }, action === 'nap' ? 14000 : 3600);
      return true;
    }
    if (!['tilt', 'stroll'].includes(action)) return false;
    this.c.cancelEffects();
    const frames = action === 'tilt'
      ? [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-7deg)' }, { transform: 'rotate(5deg)' }, { transform: 'rotate(0deg)' }]
      : [{ transform: 'translateX(0)' }, { transform: 'translate(-20px,-3px) rotate(-2deg)' }, { transform: 'translate(18px,-2px) rotate(2deg)' }, { transform: 'translateX(0)' }];
    const reaction = this.s.art.animate(frames, { duration: action === 'tilt' ? 2100 : 4500, easing: 'ease-in-out' });
    this.c.reaction = reaction; this.s.art.dataset.reaction = action;
    reaction.onfinish = () => { if (this.c.reaction === reaction) { this.c.reaction = null; this.s.art.removeAttribute('data-reaction'); } };
    return true;
  }
  consume(decision) {
    if (!decision || decision.id === this.lastDecision) return;
    if (decision.expiresAt <= Date.now() || this.disposed || this.presencePaused || this.away || document.hidden || this.s.workState || this.s.frozen || this.s.dragState.active || this.s.menuOpen || this.s.chatOpen) return;
    this.lastDecision = decision.id;
    this.s.el.dataset.mood = decision.mood;
    this.perform(decision.action);
    if (decision.text) { this.s.showWhisper(decision.text, '', '', 5500, false); this.c.greetingView = this.s.whisperView; }
  }
  async refreshDecision() {
    try {
      const state = await this.json('', {}, AbortSignal.timeout(5000));
      if (!this.disposed) this.consume(state.decision);
    } catch { /* The regular poll retries reading a reply while it is still current. */ }
  }
  async ask(trigger) {
    if (!this.settings.enabled || !this.ready() || this.request || Date.now() < this.nextAIAt) return;
    this.nextAIAt = Date.now() + 600000;
    const controller = new AbortController(); this.request = controller;
    try {
      const result = await this.json('/think', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ trigger }) }, AbortSignal.any([controller.signal, AbortSignal.timeout(65000)]));
      if (this.request === controller && !controller.signal.aborted && !this.disposed && result.ok) this.consume(result.decision);
    } catch { /* Model/network failure never stops local activity; settings UI exposes diagnostics. */ }
    finally { if (this.request === controller) this.request = null; }
  }
  touch() {
    if (this.s.motion.dataset.animation === 'nap' && !this.s.workState) this.s.playIdle();
    this.nextActionAt = Date.now() + 20000;
    clearTimeout(this.touchTimer);
    this.touchTimer = setTimeout(() => { this.touchTimer = null; void this.ask('touch'); }, 800);
  }
  async tick() {
    if (this.disposed) return;
    const controller = new AbortController(); this.poll = controller;
    try {
      const [state, presence] = await Promise.all([
        this.json('', {}, AbortSignal.any([controller.signal, AbortSignal.timeout(5000)])),
        window.petBridge?.presence ? window.petBridge.presence() : Promise.resolve({ idleSeconds: 0, paused: false }),
      ]);
      if (this.disposed || controller.signal.aborted || !state.settings) return;
      const changed = this.settings.activity !== state.settings.activity;
      this.settings = state.settings;
      const wasAway = this.away, wasPaused = this.presencePaused;
      this.away = presence.idleSeconds >= 300;
      this.presencePaused = !!presence.paused;
      if (changed || wasPaused !== this.presencePaused) this.c.syncMotion();
      if (!this.settings.enabled || this.c.quiet || this.presencePaused || this.away || this.s.workState) this.cancelRequest();
      if (!this.loaded) { this.lastDecision = state.decision?.id || null; this.loaded = true; }
      else this.consume(state.decision);
      if (this.presencePaused || this.c.quiet || this.s.workState || !this.c.canReact()) return;
      if (this.away) {
        if (this.s.motion.dataset.animation !== 'nap') { this.away = false; this.perform('nap'); this.away = true; }
        return;
      }
      if (wasAway || wasPaused) { this.perform('wave'); void this.ask('return'); this.nextActionAt = Date.now() + 30000; return; }
      if (Date.now() >= this.nextActionAt && this.ready()) {
        const options = ['tilt', 'stretch', 'wave', 'hop', 'stroll'].filter(a => a !== this.lastAction);
        this.perform(options[Math.floor(Math.random() * options.length)]);
        this.nextActionAt = Date.now() + (this.settings.activity === 'lively' ? 15000 + Math.random()*20000 : 40000 + Math.random()*40000);
        void this.ask('idle');
      }
    } catch { /* Old/offline hosts retain their existing blink/click feedback. */ }
    finally { if (this.poll === controller) this.poll = null; if (!this.disposed) this.tickTimer = setTimeout(() => void this.tick(), 8000); }
  }
  dispose() {
    this.disposed = true; clearTimeout(this.tickTimer); this.tickTimer = null;
    this.poll?.abort(); this.poll = null; this.cancelRequest(); this.cancelVisual();
  }
}
