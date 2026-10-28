/* Local animation previews only; this page never connects to a Harness session. */
(() => {
  const states = {
    idle: { name: '待命', speech: '我就在这里，等你的下一个小灵感。', description: '暂时没有任务时，安静地陪在你的桌面上。' },
    thinking: { name: '思考', speech: '唔……让我把这个小想法想清楚。', description: '模型正在思考时，云朵兔也会进入认真思考的状态。' },
    working: { name: '工作', speech: '开工啦！我们一点一点把它做好。', description: 'Harness 执行工具、推进任务时，它会切换到工作动作。' },
    waiting: { name: '等待', speech: '有个小问题，想听听你的想法。', description: '任务需要你回答问题或确认时，它会等你回应。' },
    happy: { name: '完成', speech: '完成啦！给认真努力的我们一朵小花。', description: '任务成功完成后，一起庆祝这一个小小的进展。' },
    error: { name: '错误', speech: '遇到一点小困难，我们一起看看吧。', description: '任务出错时提醒你查看应用中的错误信息，再决定下一步。' },
  };
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = preference.matches;
  const pets = [...document.querySelectorAll('[data-pet]')];
  const visible = new Set();
  const failed = new WeakMap();
  const controls = [...document.querySelectorAll('[data-motion-toggle]')];
  const canPlay = pet => !paused && !document.hidden && visible.has(pet);

  function syncPet(pet) {
    const video = pet.querySelector('video');
    const source = `assets/${pet.dataset.state}.webm`;
    if (!canPlay(pet) || failed.get(pet) === source) {
      video.pause();
      pet.classList.remove('is-playing');
      return;
    }
    if (video.getAttribute('src') !== source) {
      pet.classList.remove('is-playing');
      video.src = source;
    }
    video.play().catch(error => {
      // Source changes and scrolling can interrupt play; blocked/unsupported
      // playback retains the matching static poster without affecting downloads.
      if (video.getAttribute('src') !== source || error.name === 'AbortError') return;
      failed.set(pet, source);
      pet.classList.remove('is-playing');
    });
  }

  function syncMotion() {
    document.body.dataset.motion = paused || document.hidden ? 'paused' : 'playing';
    for (const control of controls) {
      control.hidden = false;
      control.textContent = paused ? '播放动画' : '暂停动画';
    }
    pets.forEach(syncPet);
  }

  function showState(pet, state) {
    if (pet.dataset.state === state) return;
    pet.querySelector('video').pause();
    pet.classList.remove('is-playing');
    pet.dataset.state = state;
    const poster = pet.querySelector('img');
    poster.src = `assets/${state}.webp`;
    poster.alt = `云朵兔${states[state].name}时的样子`;
    syncPet(pet);
  }

  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) visible.add(entry.target);
      else visible.delete(entry.target);
      syncPet(entry.target);
    }
  }, { threshold: 0.15 });

  for (const pet of pets) {
    const video = pet.querySelector('video');
    video.muted = true;
    video.addEventListener('playing', () => {
      if (canPlay(pet)) pet.classList.add('is-playing');
      else syncPet(pet);
    });
    video.addEventListener('error', () => {
      failed.set(pet, video.getAttribute('src'));
      pet.classList.remove('is-playing');
    });
    observer.observe(pet);
  }
  for (const control of controls) control.addEventListener('click', () => {
    paused = !paused;
    // A deliberate retry can recover after autoplay was blocked.
    pets.forEach(pet => failed.delete(pet));
    syncMotion();
  });
  preference.addEventListener('change', event => {
    if (event.matches) { paused = true; syncMotion(); }
  });
  document.addEventListener('visibilitychange', syncMotion);

  const demo = document.querySelector('[data-pet="demo"]');
  const buttons = [...document.querySelectorAll('.state-buttons button')];
  for (const button of buttons) button.addEventListener('click', () => {
    const state = button.dataset.state;
    showState(demo, state);
    for (const candidate of buttons) candidate.setAttribute('aria-pressed', String(candidate === button));
    document.getElementById('demo-speech').textContent = states[state].speech;
    document.getElementById('demo-description').textContent = states[state].description;
  });

  const hero = document.querySelector('[data-pet="hero"]');
  const hello = document.getElementById('hello-note');
  const replies = ['摸摸收到！今天也要开心呀。', '给你一朵小花，灵感慢慢来。', '有我陪着，再试一个小想法吧！'];
  let replyIndex = 0;
  let replyTimer;
  document.getElementById('pet-touch').addEventListener('click', () => {
    clearTimeout(replyTimer);
    hello.textContent = replies[replyIndex++ % replies.length];
    showState(hero, 'happy');
    replyTimer = setTimeout(() => {
      showState(hero, 'idle');
      hello.textContent = '嗨，我是云朵兔。很高兴遇见你！';
    }, 4200);
  });
  window.addEventListener('pagehide', () => {
    clearTimeout(replyTimer);
    pets.forEach(pet => pet.querySelector('video').pause());
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) {
      showState(hero, 'idle');
      hello.textContent = '嗨，我是云朵兔。很高兴遇见你！';
    }
    syncMotion();
  });
  syncMotion();
})();
