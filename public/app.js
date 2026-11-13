// 미믹 튜브 화면: #/ 홈 · #/watch/<id> 시청 · #/?q=검색어
(function () {
  const { createPlayer, fmt, store } = window.MimicPlayer;
  const app = document.getElementById('app');
  let player = null;

  // ── 도우미 ──
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COLORS = ['#6b4dff', '#22a38c', '#e0623a', '#2b7fd9', '#c2408f', '#8a6d1f', '#3f8f3a'];
  const color = (s) => COLORS[[...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
  const avatar = (name) => `<span class="avatar" style="background:${color(name)}">${esc([...String(name || '?')][0])}</span>`;
  function ago(iso) {
    const s = (Date.now() - new Date(iso)) / 1000;
    const units = [[31536000, '년'], [2592000, '개월'], [604800, '주'], [86400, '일'], [3600, '시간'], [60, '분']];
    for (const [n, u] of units) if (s >= n) return `${Math.floor(s / n)}${u} 전`;
    return '방금 전';
  }
  const views = (n) => `조회수 ${n >= 10000 ? (n / 10000).toFixed(n >= 100000 ? 0 : 1) + '만' : n.toLocaleString('ko-KR')}회`;
  const size = (b) => (b >= 1024 ** 3 ? (b / 1024 ** 3).toFixed(1) + 'GB' : (b / 1024 ** 2).toFixed(1) + 'MB');
  const resumeKey = (id) => `mt.pos.${id}`;

  async function api(path, opts = {}) {
    const res = await fetch(path, { ...opts, headers: opts.body ? { 'content-type': 'application/json' } : {}, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
    return data;
  }

  let toastTimer;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function thumbHtml(v) {
    const pos = store.get(resumeKey(v.id), 0);
    const pct = v.duration && pos ? Math.min(100, (pos / v.duration) * 100) : 0;
    return `<div class="thumb">
      ${v.thumb ? `<img src="${esc(v.thumb)}" alt="" loading="lazy">` : '<div class="ph"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg></div>'}
      ${v.duration ? `<span class="dur">${fmt(v.duration)}</span>` : ''}
      ${pct > 1 ? `<span class="resume" style="width:${pct}%"></span>` : ''}
    </div>`;
  }

  // ── 라우터 ──
  function route() {
    if (player) { player.destroy(); player = null; }
    const hash = location.hash.slice(1) || '/';
    const [path, qs] = hash.split('?');
    const params = new URLSearchParams(qs);
    const watch = /^\/watch\/([\w-]+)$/.exec(path);
    window.scrollTo(0, 0);
    if (watch) return renderWatch(watch[1]);
    document.getElementById('searchInput').value = params.get('q') || '';
    return renderHome(params.get('q') || '', params.get('sort') || 'new');
  }

  // ── 홈 ──
  async function renderHome(q, sort) {
    document.title = q ? `${q} - 미믹 튜브` : '미믹 튜브';
    app.innerHTML = '<p class="empty">불러오는 중…</p>';
    let list;
    try { list = await api(`/api/videos?sort=${sort}${q ? `&q=${encodeURIComponent(q)}` : ''}`); }
    catch (e) { app.innerHTML = `<div class="empty"><h2>목록을 불러오지 못했습니다</h2><p>${esc(e.message)}</p></div>`; return; }
    const link = (s) => `#/?${new URLSearchParams({ ...(q && { q }), sort: s })}`;
    const chips = `<div class="chips">
      ${q ? `<a class="chip on" href="#/">“${esc(q)}” 검색 지우기 ✕</a>` : ''}
      <a class="chip ${sort === 'new' ? 'on' : ''}" href="${link('new')}">최신순</a>
      <a class="chip ${sort === 'popular' ? 'on' : ''}" href="${link('popular')}">인기순</a>
      <span class="count">영상 ${list.length}개</span>
    </div>`;
    if (!list.length) {
      app.innerHTML = chips + `<div class="empty">
        <svg viewBox="0 0 24 24"><path d="M3 5h18v14H3V5Zm2 2v10h14V7H5Zm5 2 5 3-5 3V9Z"/></svg>
        <h2>${q ? '검색 결과가 없습니다' : '아직 영상이 없습니다'}</h2>
        <p>${q ? '다른 단어로 찾아보세요.' : '첫 영상을 올리거나, 영상 파일을 <code>videos/</code> 폴더에 넣어 보세요.'}</p>
        ${q ? '' : '<button class="btn primary" data-upload>영상 올리기</button>'}
      </div>`;
      return;
    }
    app.innerHTML = chips + `<div class="grid">${list.map((v) => `
      <a class="card" href="#/watch/${v.id}">
        ${thumbHtml(v)}
        <div class="meta">${avatar(v.author)}<div>
          <h3 title="${esc(v.title)}">${esc(v.title)}</h3>
          <p>${esc(v.author)}</p>
          <p>${views(v.views)} · ${ago(v.createdAt)}</p>
        </div></div>
      </a>`).join('')}</div>`;
  }

  // ── 시청 ──
  async function renderWatch(id) {
    app.innerHTML = '<p class="empty">불러오는 중…</p>';
    let v, all;
    try { [v, all] = await Promise.all([api(`/api/videos/${id}`), api('/api/videos')]); }
    catch (e) { app.innerHTML = `<div class="empty"><h2>영상을 찾지 못했습니다</h2><p>${esc(e.message)}</p><a class="btn" href="#/">홈으로</a></div>`; return; }
    document.title = `${v.title} - 미믹 튜브`;
    const others = all.filter((x) => x.id !== v.id);
    const theater = store.get('mt.theater', false);
    const liked = store.get(`mt.liked.${v.id}`, false);

    app.innerHTML = `<div class="watch ${theater ? 'theater' : ''}">
      <section>
        <div id="playerBox"></div>
        <h1>${esc(v.title)}</h1>
        <div class="bar">
          <div class="who">${avatar(v.author)}<div><strong>${esc(v.author)}</strong><small>${ago(v.createdAt)} 업로드</small></div></div>
          <button class="btn ${liked ? 'on' : ''}" id="likeBtn"><svg viewBox="0 0 24 24"><path d="M2 21h4V9H2v12Zm20-11a2 2 0 0 0-2-2h-6.3l1-4.6v-.3c0-.4-.2-.8-.4-1.1L13.2 1 6.6 7.6c-.4.4-.6.9-.6 1.4v10c0 1.1.9 2 2 2h9c.8 0 1.5-.5 1.8-1.2l3-7.1c.1-.2.2-.5.2-.7v-2Z"/></svg><span>${v.likes}</span></button>
          <button class="btn" id="shareBtn"><svg viewBox="0 0 24 24"><path d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11Z"/></svg>공유</button>
          <a class="btn" href="${esc(v.src)}" download><svg viewBox="0 0 24 24"><path d="M11 4h2v8.2l3.3-3.3 1.4 1.4L12 16l-5.7-5.7 1.4-1.4 3.3 3.3V4ZM5 18h14v2H5v-2Z"/></svg>저장</a>
          <button class="btn" id="editBtn" title="제목·설명 수정"><svg viewBox="0 0 24 24"><path d="M4 17.2V20h2.8l8.3-8.3-2.8-2.8L4 17.2ZM19.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8 2.8 2.8L19.7 7Z"/></svg></button>
          <button class="btn" id="deleteBtn" title="삭제"><svg viewBox="0 0 24 24"><path d="M7 21a2 2 0 0 1-2-2V7H4V5h5V4h6v1h5v2h-1v12a2 2 0 0 1-2 2H7Zm2-4h2V9H9v8Zm4 0h2V9h-2v8Z"/></svg></button>
        </div>
        <div class="desc"><b>${views(v.views)} · ${new Date(v.createdAt).toLocaleDateString('ko-KR')}${v.size ? ` · ${size(v.size)}` : ''}</b>${esc(v.description) || '<span style="color:var(--muted)">설명이 없습니다.</span>'}</div>
        <div class="comments">
          <h2>댓글 <span id="ccount">${v.comments.length}</span>개</h2>
          <form class="cform" id="cform">
            <input id="cauthor" placeholder="이름" maxlength="40" value="${esc(store.get('mt.name', ''))}">
            <input id="ctext" placeholder="댓글 추가…" maxlength="1000" required>
            <button class="btn primary">등록</button>
          </form>
          <div id="clist">${v.comments.map(commentHtml).join('')}</div>
        </div>
      </section>
      <aside class="side">
        <h2>다음 영상 <label><input type="checkbox" id="autoNext" ${store.get('mt.autonext', true) ? 'checked' : ''}> 자동 재생</label></h2>
        ${others.length ? others.map((x) => `
          <a class="mini" href="#/watch/${x.id}">${thumbHtml(x)}<div><h3>${esc(x.title)}</h3><p>${esc(x.author)}</p><p>${views(x.views)} · ${ago(x.createdAt)}</p></div></a>`).join('')
          : '<p style="color:var(--muted)">다른 영상이 없습니다.</p>'}
      </aside>
    </div>`;

    const watchEl = app.querySelector('.watch');
    let counted = false;
    let lastSave = 0;
    player = createPlayer(document.getElementById('playerBox'), {
      src: v.src,
      poster: v.thumb,
      startAt: store.get(resumeKey(v.id), 0),
      autoplay: true,
      onTheater() { const on = watchEl.classList.toggle('theater'); store.set('mt.theater', on); },
      onTime(t, d) {
        if (!counted && t > 3) { counted = true; api(`/api/videos/${v.id}/view`, { method: 'POST' }).catch(() => {}); }
        if (Math.abs(t - lastSave) > 3) { lastSave = t; store.set(resumeKey(v.id), d && t > d - 5 ? 0 : t); }
      },
      onEnded() {
        store.set(resumeKey(v.id), 0);
        if (others.length && document.getElementById('autoNext')?.checked) {
          toast(`다음 영상: ${others[0].title}`);
          setTimeout(() => { if (location.hash === `#/watch/${v.id}`) location.hash = `#/watch/${others[0].id}`; }, 1500);
        }
      },
    });
    player.el.focus({ preventScroll: true });

    document.getElementById('autoNext')?.addEventListener('change', (e) => store.set('mt.autonext', e.target.checked));

    document.getElementById('likeBtn').onclick = async (e) => {
      const b = e.currentTarget;
      const undo = store.get(`mt.liked.${v.id}`, false);
      try {
        const r = await api(`/api/videos/${v.id}/like`, { method: 'POST', body: { undo } });
        store.set(`mt.liked.${v.id}`, !undo);
        b.classList.toggle('on', !undo); b.querySelector('span').textContent = r.likes;
      } catch (err) { toast(err.message); }
    };
    document.getElementById('shareBtn').onclick = async () => {
      const url = `${location.origin}/#/watch/${v.id}`;
      try { await navigator.clipboard.writeText(url); toast('링크를 복사했습니다'); }
      catch { prompt('이 링크를 복사하세요', url); }
    };
    document.getElementById('editBtn').onclick = async () => {
      const title = prompt('제목', v.title);
      if (title === null) return;
      const description = prompt('설명', v.description);
      if (description === null) return;
      try { await api(`/api/videos/${v.id}`, { method: 'PATCH', body: { title, description } }); toast('수정했습니다'); route(); }
      catch (err) { toast(err.message); }
    };
    document.getElementById('deleteBtn').onclick = async () => {
      if (!confirm(`"${v.title}" 영상을 삭제할까요? 파일도 함께 지워집니다.`)) return;
      try { await api(`/api/videos/${v.id}`, { method: 'DELETE' }); toast('삭제했습니다'); location.hash = '#/'; }
      catch (err) { toast(err.message); }
    };
    document.getElementById('cform').onsubmit = async (e) => {
      e.preventDefault();
      const author = document.getElementById('cauthor').value.trim();
      const input = document.getElementById('ctext');
      store.set('mt.name', author);
      try {
        const c = await api(`/api/videos/${v.id}/comments`, { method: 'POST', body: { author, text: input.value } });
        document.getElementById('clist').insertAdjacentHTML('afterbegin', commentHtml(c));
        const cc = document.getElementById('ccount'); cc.textContent = Number(cc.textContent) + 1;
        input.value = '';
      } catch (err) { toast(err.message); }
    };
  }

  function commentHtml(c) {
    return `<div class="comment">${avatar(c.author)}<div><strong>${esc(c.author)}</strong><small>${ago(c.createdAt)}</small><p>${esc(c.text)}</p></div></div>`;
  }

  // ── 검색 ──
  document.getElementById('searchForm').onsubmit = (e) => {
    e.preventDefault();
    const q = document.getElementById('searchInput').value.trim();
    location.hash = q ? `#/?q=${encodeURIComponent(q)}` : '#/';
  };

  // ── 업로드 ──
  const dlg = document.getElementById('uploadDialog');
  const fileInput = document.getElementById('fileInput');
  const titleInput = document.getElementById('titleInput');
  const drop = document.getElementById('dropZone');
  const prog = document.getElementById('uploadProgress');
  const errEl = document.getElementById('uploadError');
  let xhr = null;

  function openUpload() {
    document.getElementById('uploadForm').reset();
    document.getElementById('dropText').textContent = '영상 파일을 끌어다 놓거나 눌러서 선택';
    document.getElementById('authorInput').value = store.get('mt.name', '');
    errEl.textContent = ''; prog.hidden = true;
    document.getElementById('uploadSubmit').disabled = false;
    dlg.showModal();
  }
  document.getElementById('uploadBtn').onclick = openUpload;
  app.addEventListener('click', (e) => { if (e.target.closest('[data-upload]')) openUpload(); });
  document.getElementById('uploadCancel').onclick = () => { xhr?.abort(); dlg.close(); };

  function pickFile(f) {
    if (!f) return;
    document.getElementById('dropText').textContent = `${f.name} (${size(f.size)})`;
    if (!titleInput.value) titleInput.value = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
  }
  fileInput.onchange = () => pickFile(fileInput.files[0]);
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('over')));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) { const dt = new DataTransfer(); dt.items.add(f); fileInput.files = dt.files; pickFile(f); }
  });
  // 업로드 창이 닫혀 있을 때 페이지에 파일을 끌어다 놓아도 업로드 창이 열림
  document.addEventListener('dragover', (e) => { if (!dlg.open && e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
  document.addEventListener('drop', (e) => {
    if (dlg.open || !e.dataTransfer?.files.length) return;
    e.preventDefault(); openUpload();
    const dt = new DataTransfer(); dt.items.add(e.dataTransfer.files[0]); fileInput.files = dt.files; pickFile(e.dataTransfer.files[0]);
  });

  document.getElementById('uploadForm').onsubmit = (e) => {
    e.preventDefault();
    const f = fileInput.files[0];
    if (!f) { errEl.textContent = '영상 파일을 선택하세요'; return; }
    const author = document.getElementById('authorInput').value.trim();
    store.set('mt.name', author);
    const qs = new URLSearchParams({ filename: f.name, title: titleInput.value.trim(), description: document.getElementById('descInput').value, author: author || '미믹' });
    errEl.textContent = ''; prog.hidden = false;
    const bar = prog.querySelector('div'), label = prog.querySelector('span');
    document.getElementById('uploadSubmit').disabled = true;
    xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/upload?${qs}`);
    xhr.upload.onprogress = (ev) => {
      const p = ev.lengthComputable ? Math.round((ev.loaded / ev.total) * 100) : 0;
      bar.style.width = `${p}%`; label.textContent = p < 100 ? `${p}% 올리는 중…` : '썸네일 만드는 중…';
    };
    xhr.onload = () => {
      let data = {}; try { data = JSON.parse(xhr.responseText); } catch { /* */ }
      document.getElementById('uploadSubmit').disabled = false;
      if (xhr.status === 201) { dlg.close(); toast('업로드했습니다'); location.hash = `#/watch/${data.id}`; }
      else { errEl.textContent = data.error || `업로드 실패 (${xhr.status})`; prog.hidden = true; }
    };
    xhr.onerror = () => { errEl.textContent = '네트워크 오류로 업로드하지 못했습니다'; prog.hidden = true; document.getElementById('uploadSubmit').disabled = false; };
    xhr.onabort = () => { prog.hidden = true; document.getElementById('uploadSubmit').disabled = false; };
    xhr.send(f);
  };

  window.addEventListener('hashchange', route);
  route();
})();
