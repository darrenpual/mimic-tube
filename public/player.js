// 미믹 튜브 영상 플레이어 (외부 라이브러리 없음)
// createPlayer(container, { src, poster, startAt, autoplay, onEnded, onTheater, onTime })
// 단축키: Space/K 재생·정지 · J/L 10초 · ←/→ 5초 · ↑/↓ 볼륨 · M 음소거 · F 전체화면 · T 극장 모드 · 0~9 구간 이동 · <,> 속도
(function () {
  const I = {
    play: '<path d="M8 5.5v13l11-6.5z"/>',
    pause: '<path d="M7 5h4v14H7zm6 0h4v14h-4z"/>',
    replay: '<path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7Z"/>',
    vol: '<path d="M4 9v6h4l5 4V5L8 9H4Zm11.5 3A4.5 4.5 0 0 0 13 8v8a4.5 4.5 0 0 0 2.5-4ZM13 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6Z"/>',
    volLow: '<path d="M6 9v6h4l5 4V5l-5 4H6Zm11.5 3A4.5 4.5 0 0 0 15 8v8a4.5 4.5 0 0 0 2.5-4Z"/>',
    mute: '<path d="M4 9v6h4l5 4V5L8 9H4Zm16.6 3 2.1-2.1-1.4-1.4-2.1 2.1-2.1-2.1-1.4 1.4 2.1 2.1-2.1 2.1 1.4 1.4 2.1-2.1 2.1 2.1 1.4-1.4z"/>',
    gear: '<path d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.5 7.5 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.5 7.5 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.5 7.5 0 0 0 1.7 1L11 21h4l.4-2.9a7.5 7.5 0 0 0 1.7-1l2.5 1 2-3.5L19.4 13ZM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z" transform="translate(-1 0)"/>',
    pip: '<path d="M3 5h18v8h-2V7H5v10h7v2H3V5Zm11 9h8v6h-8v-6Z"/>',
    theater: '<path d="M2 7h20v10H2V7Zm2 2v6h16V9H4Z"/>',
    full: '<path d="M4 4h6v2H6v4H4V4Zm10 0h6v6h-2V6h-4V4ZM4 14h2v4h4v2H4v-6Zm14 0h2v6h-6v-2h4v-4Z"/>',
    exitFull: '<path d="M8 4h2v6H4V8h4V4Zm6 0h2v4h4v2h-6V4ZM4 14h6v6H8v-4H4v-2Zm10 0h6v2h-4v4h-2v-6Z"/>',
    back10: '<path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7Z"/><text x="12" y="15.5" font-size="6.5" text-anchor="middle" font-weight="700" font-family="sans-serif">10</text>',
    fwd10: '<path d="M12 5V2l5 4-5 4V7a5 5 0 1 0 5 5h2a7 7 0 1 1-7-7Z"/><text x="12" y="15.5" font-size="6.5" text-anchor="middle" font-weight="700" font-family="sans-serif">10</text>',
  };
  const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${I[name]}</svg>`;
  const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  function fmt(s) {
    if (!Number.isFinite(s) || s < 0) s = 0;
    s = Math.floor(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  }

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 환경 */ } },
  };

  function createPlayer(container, opts) {
    const root = document.createElement('div');
    root.className = 'player';
    root.tabIndex = 0;
    root.innerHTML = `
      <video playsinline preload="metadata"></video>
      <div class="spinner" hidden></div>
      <div class="center"></div>
      <div class="osd"></div>
      <div class="menu" hidden></div>
      <div class="controls">
        <div class="seek" role="slider" aria-label="재생 위치" tabindex="-1">
          <div class="track"><div class="buffered"></div><div class="hoverbar"></div><div class="played"></div><div class="knob"></div></div>
          <div class="tip">0:00</div>
        </div>
        <div class="row">
          <button class="ctl" data-a="play" title="재생 (K)">${svg('play')}</button>
          <button class="ctl" data-a="back" title="10초 뒤로 (J)">${svg('back10')}</button>
          <button class="ctl" data-a="fwd" title="10초 앞으로 (L)">${svg('fwd10')}</button>
          <div class="vol">
            <button class="ctl" data-a="mute" title="음소거 (M)">${svg('vol')}</button>
            <input type="range" min="0" max="1" step="0.05" aria-label="볼륨">
          </div>
          <span class="time">0:00 / 0:00</span>
          <span class="spacer"></span>
          <button class="ctl" data-a="settings" title="재생 속도">${svg('gear')}</button>
          <button class="ctl" data-a="pip" title="PIP 모드">${svg('pip')}</button>
          <button class="ctl" data-a="theater" title="극장 모드 (T)">${svg('theater')}</button>
          <button class="ctl" data-a="full" title="전체 화면 (F)">${svg('full')}</button>
        </div>
      </div>`;
    container.replaceChildren(root);

    const $ = (s) => root.querySelector(s);
    const v = $('video');
    const btn = (a) => root.querySelector(`[data-a="${a}"]`);
    const seek = $('.seek'), played = $('.played'), buffered = $('.buffered'), hoverbar = $('.hoverbar'), knob = $('.knob'), tip = $('.tip');
    const volInput = $('.vol input'), time = $('.time'), center = $('.center'), osd = $('.osd'), spinner = $('.spinner'), menu = $('.menu');

    v.src = opts.src;
    if (opts.poster) v.poster = opts.poster;
    v.volume = store.get('mt.volume', 1);
    v.muted = store.get('mt.muted', false);
    v.playbackRate = store.get('mt.rate', 1);
    if (!('pictureInPictureEnabled' in document) || !document.pictureInPictureEnabled) btn('pip').hidden = true;

    let ended = false;
    let pendingStart = opts.startAt || 0;
    v.addEventListener('loadedmetadata', () => {
      if (pendingStart && pendingStart < v.duration - 5) { v.currentTime = pendingStart; flash(`이어서 재생 ${fmt(pendingStart)}`); }
      pendingStart = 0;
      render();
    });

    // ── 표시 ──
    let osdTimer;
    function flash(text) { osd.textContent = text; osd.classList.add('show'); clearTimeout(osdTimer); osdTimer = setTimeout(() => osd.classList.remove('show'), 900); }
    let centerTimer;
    function pulse(icon) { center.innerHTML = svg(icon); center.classList.add('show'); clearTimeout(centerTimer); centerTimer = setTimeout(() => center.classList.remove('show'), 450); }

    function render() {
      const d = v.duration || 0;
      const pct = d ? (v.currentTime / d) * 100 : 0;
      played.style.width = `${pct}%`;
      knob.style.left = `${pct}%`;
      time.textContent = `${fmt(v.currentTime)} / ${fmt(d)}`;
      seek.setAttribute('aria-valuenow', Math.round(pct));
      if (v.buffered.length && d) buffered.style.width = `${(v.buffered.end(v.buffered.length - 1) / d) * 100}%`;
    }
    function renderPlay() {
      btn('play').innerHTML = svg(ended ? 'replay' : v.paused ? 'play' : 'pause');
      btn('play').title = v.paused ? '재생 (K)' : '일시정지 (K)';
      root.classList.toggle('playing', !v.paused);
    }
    function renderVol() {
      const level = v.muted ? 0 : v.volume;
      btn('mute').innerHTML = svg(level === 0 ? 'mute' : level < 0.5 ? 'volLow' : 'vol');
      volInput.value = level;
      volInput.style.background = '';
      store.set('mt.volume', v.volume); store.set('mt.muted', v.muted);
    }

    v.addEventListener('timeupdate', () => { render(); opts.onTime?.(v.currentTime, v.duration); });
    v.addEventListener('progress', render);
    v.addEventListener('durationchange', render);
    v.addEventListener('play', () => { ended = false; renderPlay(); });
    v.addEventListener('pause', renderPlay);
    v.addEventListener('ended', () => { ended = true; renderPlay(); showControls(); opts.onEnded?.(); });
    v.addEventListener('volumechange', renderVol);
    v.addEventListener('waiting', () => { spinner.hidden = false; });
    ['playing', 'canplay', 'seeked', 'pause'].forEach((e) => v.addEventListener(e, () => { spinner.hidden = true; }));
    v.addEventListener('error', () => flash('영상을 재생할 수 없습니다 (브라우저가 지원하지 않는 형식일 수 있어요)'));

    // ── 동작 ──
    function toggle() {
      if (v.paused || v.ended) { v.play().catch(() => {}); pulse('play'); } else { v.pause(); pulse('pause'); }
    }
    function skip(sec) {
      v.currentTime = Math.max(0, Math.min((v.duration || 0), v.currentTime + sec));
      flash(`${sec > 0 ? '+' : ''}${sec}초`);
    }
    function setVolume(x) { v.volume = Math.max(0, Math.min(1, x)); v.muted = v.volume === 0; flash(`볼륨 ${Math.round(v.volume * 100)}%`); }
    function setRate(r) { v.playbackRate = r; store.set('mt.rate', r); flash(`속도 ${r}x`); }
    function fullscreen() {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (root.requestFullscreen) root.requestFullscreen();
      else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen(); // iOS
    }
    document.addEventListener('fullscreenchange', onFs);
    function onFs() { btn('full').innerHTML = svg(document.fullscreenElement === root ? 'exitFull' : 'full'); }

    function openMenu() {
      if (!menu.hidden) { menu.hidden = true; return; }
      menu.innerHTML = '<div class="title">재생 속도</div>' + SPEEDS.map((s) => `<button data-rate="${s}" class="${s === v.playbackRate ? 'on' : ''}">${s === 1 ? '보통' : s + 'x'}</button>`).join('');
      menu.hidden = false;
    }
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('[data-rate]');
      if (b) { setRate(Number(b.dataset.rate)); menu.hidden = true; }
    });

    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) {
        if (e.target === v || e.target === center) { if (!menu.hidden) menu.hidden = true; else toggle(); }
        return;
      }
      const a = b.dataset.a;
      if (a !== 'settings') menu.hidden = true;
      if (a === 'play') toggle();
      else if (a === 'back') skip(-10);
      else if (a === 'fwd') skip(10);
      else if (a === 'mute') { v.muted = !v.muted; if (!v.muted && v.volume === 0) v.volume = 0.5; }
      else if (a === 'settings') openMenu();
      else if (a === 'pip') (document.pictureInPictureElement ? document.exitPictureInPicture() : v.requestPictureInPicture()).catch(() => {});
      else if (a === 'theater') opts.onTheater?.();
      else if (a === 'full') fullscreen();
      root.focus({ preventScroll: true });
    });
    v.addEventListener('dblclick', fullscreen);
    volInput.addEventListener('input', () => { v.volume = Number(volInput.value); v.muted = v.volume === 0; });

    // 탐색 바: 클릭·드래그·터치
    const ratioAt = (x) => { const r = seek.getBoundingClientRect(); return Math.max(0, Math.min(1, (x - r.left) / r.width)); };
    let dragging = false, wasPlaying = false;
    seek.addEventListener('pointerdown', (e) => {
      dragging = true; wasPlaying = !v.paused; v.pause();
      seek.classList.add('drag'); seek.setPointerCapture(e.pointerId);
      scrub(e);
    });
    seek.addEventListener('pointermove', (e) => {
      const r = ratioAt(e.clientX);
      hoverbar.style.width = `${r * 100}%`;
      tip.style.left = `${Math.max(4, Math.min(96, r * 100))}%`;
      tip.textContent = fmt(r * (v.duration || 0));
      if (dragging) scrub(e);
    });
    seek.addEventListener('pointerleave', () => { hoverbar.style.width = '0'; });
    const endDrag = () => { if (!dragging) return; dragging = false; seek.classList.remove('drag'); if (wasPlaying) v.play().catch(() => {}); };
    seek.addEventListener('pointerup', endDrag);
    seek.addEventListener('pointercancel', endDrag);
    function scrub(e) { if (v.duration) { v.currentTime = ratioAt(e.clientX) * v.duration; render(); } }

    // 컨트롤 자동 숨김
    let idleTimer;
    function showControls() {
      root.classList.remove('idle'); clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { if (!v.paused && menu.hidden && !dragging) root.classList.add('idle'); }, 2500);
    }
    root.addEventListener('pointermove', showControls);
    root.addEventListener('pointerdown', showControls);
    root.addEventListener('mouseleave', () => { if (!v.paused) root.classList.add('idle'); });

    // 단축키 (입력창에 쓰는 중이면 무시)
    function onKey(e) {
      if ((e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable], dialog')) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!root.isConnected) return;
      const k = e.key.toLowerCase();
      const map = {
        ' ': toggle, k: toggle, j: () => skip(-10), l: () => skip(10),
        arrowleft: () => skip(-5), arrowright: () => skip(5),
        arrowup: () => setVolume(v.volume + 0.05), arrowdown: () => setVolume(v.volume - 0.05),
        m: () => { v.muted = !v.muted; flash(v.muted ? '음소거' : `볼륨 ${Math.round(v.volume * 100)}%`); },
        f: fullscreen, t: () => opts.onTheater?.(),
        '>': () => setRate(SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(v.playbackRate) + 1)] || 1),
        '<': () => setRate(SPEEDS[Math.max(0, SPEEDS.indexOf(v.playbackRate) - 1)] || 1),
      };
      if (/^[0-9]$/.test(k) && v.duration) { v.currentTime = (Number(k) / 10) * v.duration; e.preventDefault(); showControls(); return; }
      if (map[k]) { e.preventDefault(); map[k](); showControls(); }
    }
    document.addEventListener('keydown', onKey);

    renderPlay(); renderVol(); render();
    if (opts.autoplay) v.play().catch(() => { /* 자동 재생이 막히면 버튼을 누르면 됨 */ });

    return {
      video: v,
      el: root,
      destroy() {
        document.removeEventListener('keydown', onKey);
        document.removeEventListener('fullscreenchange', onFs);
        clearTimeout(idleTimer);
        v.pause(); v.removeAttribute('src'); v.load();
      },
    };
  }

  window.MimicPlayer = { createPlayer, fmt, store };
})();
