'use strict';

/** Local cloud-bunny reactions. Task state and desktop coordinates remain owned by PetSprite. */
class CloudBunnyCompanion {
  constructor(sprite) {
    this.sprite = sprite;
    this.disposed = false;
    this.reaction = null;
    this.blinkTimer = null;
    this.idleTimer = null;
    this.greetingView = null;
    this.storageKey = 'dsh-tuzi.companion.reduce-motion.' + sprite.pet.id;
    this.reduceMotion = false;
    this.preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    try {
      this.reduceMotion = localStorage.getItem(this.storageKey) === 'true';
    } catch (error) {
      console.warn('[dsh-tuzi-pet] 无法读取动作偏好，本次跟随系统设置', error);
    }
    this.blinkImage = document.createElement('img');
    this.blinkImage.className = 'pet-blink';
    this.blinkImage.alt = '';
    this.blinkImage.setAttribute('aria-hidden', 'true');
    this.ready = false;
    this.blinkImage.addEventListener('load', () => { this.ready = true; }, { signal: sprite.ac.signal });
    this.blinkImage.addEventListener('error', () => {
      this.ready = false;
      console.warn('[dsh-tuzi-pet] 闭眼素材无法加载，保留现有桌宠动画');
    }, { signal: sprite.ac.signal });
    this.blinkImage.src = new URL('./assets/blink.webp', document.baseURI).href;
    sprite.motion.appendChild(this.blinkImage);
    sprite.hit.setAttribute('role', 'button');
    sprite.hit.tabIndex = 0;
    sprite.hit.setAttribute('aria-label', '云朵兔：点击轻跳，右键选择互动');
    sprite.hit.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      if (!event.repeat) this.react('hop');
    }, { signal: sprite.ac.signal });
    this.preference.addEventListener('change', () => this.syncMotion(), { signal: sprite.ac.signal });
    document.addEventListener('visibilitychange', () => this.syncMotion(), { signal: sprite.ac.signal });
    this.syncMotion();
  }

  get quiet() { return this.reduceMotion || this.preference.matches; }

  canReact() {
    const s = this.sprite;
    return !this.disposed && !this.quiet && !document.hidden && !s.frozen &&
      !s.dragState.active && s.throwRef === null && s.moveRef === null &&
      s.posFollow === null && !s.menuOpen && !s.chatOpen;
  }

  /** Cosmetic reactions are cancelled synchronously before dragging or changing task animation. */
  cancelEffects() {
    clearTimeout(this.blinkTimer);
    this.blinkTimer = null;
    this.blinkImage.classList.remove('is-blinking');
    this.sprite.art.classList.remove('has-blink');
    if (this.reaction) this.reaction.cancel();
    this.reaction = null;
    this.sprite.art.removeAttribute('data-reaction');
  }

  blink() {
    if (!this.canReact() || !this.ready || !this.sprite.animations.idle.includes(this.sprite.anim)) return;
    this.cancelEffects();
    this.blinkImage.style.transform = this.sprite.facing === 'right' ? 'scaleX(-1)' : '';
    this.blinkImage.classList.add('is-blinking');
    this.blinkTimer = setTimeout(() => {
      this.blinkTimer = null;
      this.blinkImage.classList.remove('is-blinking');
      this.sprite.art.classList.remove('has-blink');
    }, 170);
  }

  hop() {
    if (!this.canReact()) return;
    this.cancelEffects();
    const height = Math.min(24, this.sprite.size * 0.065);
    this.sprite.art.dataset.reaction = 'hop';
    const reaction = this.sprite.art.animate([
      { transform: 'translateY(0) scale(1)', offset: 0 },
      { transform: 'translateY(0) scale(1.035, .94)', offset: 0.16 },
      { transform: `translateY(-${height}px) scale(.99, 1.02)`, offset: 0.46 },
      { transform: 'translateY(0) scale(1.025, .96)', offset: 0.8 },
      { transform: 'translateY(0) scale(1)', offset: 1 },
    ], { duration: 660, easing: 'ease-in-out' });
    this.reaction = reaction;
    reaction.onfinish = () => {
      if (this.reaction !== reaction) return;
      this.reaction = null;
      this.sprite.art.removeAttribute('data-reaction');
    };
  }

  react(action) {
    if (this.disposed || this.sprite.dragState.active || this.sprite.frozen) return;
    if (action === 'blink') this.blink();
    else this.hop();
    // User-triggered local greetings never cover a live task, error or approval bubble.
    if (!this.sprite.workState) {
      this.sprite.showWhisper(this.quiet ? '我会安静陪着你，任务有变化还是会告诉你。' :
        action === 'blink' ? '眨眨眼，给你一点小小的好运。' : '摸摸收到！陪你把小想法慢慢做好。', '', '', 2600, false);
      this.greetingView = this.sprite.whisperView;
    }
  }

  onTaskChange() {
    this.cancelEffects();
    if (this.greetingView && this.sprite.whisperView === this.greetingView) this.sprite.clearWhisper();
    this.greetingView = null;
  }

  onAnimation(name) {
    this.sprite.motion.dataset.animation = name;
  }

  scheduleBlink() {
    clearTimeout(this.idleTimer);
    this.idleTimer = null;
    if (this.disposed || this.quiet || document.hidden) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (!this.sprite.workState && this.sprite.animations.idle.includes(this.sprite.anim)) this.blink();
      this.scheduleBlink();
    }, 3800 + Math.random() * 3000);
  }

  syncMotion() {
    if (this.disposed) return;
    this.cancelEffects();
    this.sprite.el.dataset.quiet = String(this.quiet);
    this.sprite.el.dataset.motionPaused = String(this.quiet || document.hidden || this.sprite.frozen);
    const s = this.sprite;
    if (this.quiet || document.hidden || s.frozen) {
      s.stopSquash();
      for (const video of [s.videoA, s.videoB]) {
        video.pause();
        video.style.transform = s.facing === 'right' ? 'scaleX(-1)' : '';
      }
    } else {
      const video = s.front === 0 ? s.videoA : s.videoB;
      if (video.readyState >= 2) video.play().catch(error => {
        if (error.name !== 'AbortError') console.warn('[dsh-tuzi-pet] 恢复动画失败，保留当前画面', error);
      });
    }
    this.scheduleBlink();
  }

  menuItems() {
    const motion = this.preference.matches
      ? { label: '减少动作：跟随系统', action: 'bunny-system-motion' }
      : { label: this.reduceMotion ? '恢复活泼动作' : '减少动作', action: 'bunny-toggle-motion' };
    return [
      { label: '隐藏云朵兔（主界面可开启）', action: 'bunny-hide' },
      ...(!this.quiet ? [{ label: '和云朵兔玩', children: [
        { label: '眨眨眼', action: 'bunny-blink' },
        { label: '开心跳一下', action: 'bunny-hop' },
      ] }] : []),
      motion,
    ];
  }

  handleMenu(action) {
    if (action === 'bunny-hide') {
      this.sprite.setPetDisplay(this.sprite.pet.display === 'both' ? 'web' : 'none');
    } else if (action === 'bunny-blink' || action === 'bunny-hop') {
      this.react(action === 'bunny-blink' ? 'blink' : 'hop');
    } else if (action === 'bunny-toggle-motion') {
      this.reduceMotion = !this.reduceMotion;
      this.syncMotion();
      try {
        localStorage.setItem(this.storageKey, String(this.reduceMotion));
      } catch (error) {
        console.warn('[dsh-tuzi-pet] 无法保存动作偏好，仅本次生效', error);
        this.sprite.showWhisper('动作设置本次已生效，但暂时无法保存；重启后请重新设置。', '', '', 4000, false);
      }
    } else if (action === 'bunny-system-motion') {
      this.sprite.showWhisper('已跟随系统减少动态效果。任务状态与拖拽仍然可用。', '', '', 3500, false);
    } else {
      return false;
    }
    return true;
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.cancelEffects();
    this.blinkImage.remove();
  }
}
