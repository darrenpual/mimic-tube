#!/usr/bin/env node
// 미믹 튜브: 우리 영상을 올리고 보는 웹사이트. 외부 패키지 없음(Node 18+), ffmpeg 가 있으면 썸네일·길이 자동.
//   node server.mjs            → http://localhost:4400
//   PORT=5000 node server.mjs
// 영상 파일을 videos/ 폴더에 직접 넣어도 다음 목록 요청 때 자동으로 등록됩니다.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const VIDEOS = path.join(ROOT, 'videos');
const THUMBS = path.join(ROOT, 'data', 'thumbs');
const DB_FILE = path.join(ROOT, 'data', 'videos.json');
const PORT = Number(process.env.PORT || 4400);
const MAX_UPLOAD = 4 * 1024 ** 3; // 4GB
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.m4v', '.ogv', '.mkv']);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.ogv': 'video/ogg', '.mkv': 'video/x-matroska',
};

for (const d of [VIDEOS, THUMBS]) fs.mkdirSync(d, { recursive: true });

// ── 저장소(JSON 파일 하나) ──────────────────────────────
function loadDb() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { return { videos: [] }; }
}
function saveDb(db) {
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}
let db = loadDb();

const hasFfmpeg = await new Promise((r) => execFile('ffprobe', ['-version'], (e) => r(!e)));

function probe(file) {
  return new Promise((resolve) => {
    if (!hasFfmpeg) return resolve(0);
    execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], (e, out) => resolve(e ? 0 : Math.round(Number(out) || 0)));
  });
}
function makeThumb(file, out, duration) {
  return new Promise((resolve) => {
    if (!hasFfmpeg) return resolve(false);
    const at = duration > 4 ? Math.min(duration * 0.2, 30) : 0;
    execFile('ffmpeg', ['-y', '-v', 'error', '-ss', String(at), '-i', file, '-frames:v', '1', '-vf', 'scale=640:-2', out], (e) => resolve(!e));
  });
}

async function finishVideo(v) {
  const file = path.join(VIDEOS, v.file);
  v.duration = await probe(file);
  v.thumb = (await makeThumb(file, path.join(THUMBS, `${v.id}.jpg`), v.duration)) ? `/thumbs/${v.id}.jpg` : null;
  v.size = fs.statSync(file).size;
  saveDb(db);
}

// videos/ 에 직접 넣은 파일을 등록하고, 지워진 파일은 목록에서 뺀다.
let syncing = null;
function syncFolder() {
  syncing ||= (async () => {
    const files = fs.readdirSync(VIDEOS).filter((f) => VIDEO_EXT.has(path.extname(f).toLowerCase()));
    const known = new Set(db.videos.map((v) => v.file));
    const before = db.videos.length;
    db.videos = db.videos.filter((v) => files.includes(v.file));
    const fresh = files.filter((f) => !known.has(f));
    for (const f of fresh) {
      const v = newVideo({ file: f, title: path.parse(f).name.replace(/[_-]+/g, ' ') });
      db.videos.push(v);
      await finishVideo(v);
    }
    if (fresh.length || db.videos.length !== before) saveDb(db);
  })().finally(() => { syncing = null; });
  return syncing;
}

function newVideo({ file, title, description = '', author = '미믹' }) {
  return {
    id: crypto.randomBytes(6).toString('base64url'),
    file, title: String(title).slice(0, 120) || '제목 없음', description: String(description).slice(0, 5000),
    author: String(author).slice(0, 40) || '미믹', createdAt: new Date().toISOString(),
    views: 0, likes: 0, duration: 0, thumb: null, size: 0, comments: [],
  };
}

const publicVideo = ({ comments, ...v }) => ({ ...v, src: `/media/${encodeURIComponent(v.file)}`, commentCount: comments.length });

// ── HTTP ───────────────────────────────────────────────
function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, { 'content-type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', ...headers });
  res.end(isJson ? JSON.stringify(body) : body);
}

function readJson(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

// 파일을 Range 요청(구간 재생·탐색) 지원하며 보낸다.
function serveFile(req, res, file, cache = 'no-cache') {
  let stat;
  try { stat = fs.statSync(file); } catch { return send(res, 404, 'Not found'); }
  if (!stat.isFile()) return send(res, 404, 'Not found');
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? Number(m[1]) : NaN;
    let end = m && m[2] ? Number(m[2]) : stat.size - 1;
    if (Number.isNaN(start)) { start = stat.size - end; end = stat.size - 1; } // bytes=-500
    if (!m || start > end || start >= stat.size) return send(res, 416, '', { 'content-range': `bytes */${stat.size}` });
    end = Math.min(end, stat.size - 1);
    res.writeHead(206, { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${stat.size}`, 'content-length': end - start + 1, 'cache-control': cache });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': stat.size, 'cache-control': cache });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

// 경로 탈출(../) 방지
function safeJoin(base, rel) {
  const p = path.normalize(path.join(base, rel));
  return p.startsWith(base + path.sep) ? p : null;
}

async function handleUpload(req, res, url) {
  const name = path.basename(url.searchParams.get('filename') || 'video.mp4');
  const ext = path.extname(name).toLowerCase();
  if (!VIDEO_EXT.has(ext)) return send(res, 400, { error: `지원하지 않는 형식입니다 (${[...VIDEO_EXT].join(', ')})` });
  const len = Number(req.headers['content-length'] || 0);
  if (len > MAX_UPLOAD) return send(res, 413, { error: '파일이 너무 큽니다 (최대 4GB)' });
  const stored = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}${ext}`;
  const final = path.join(VIDEOS, stored);
  const dest = `${final}.part`; // 다 받기 전에는 폴더 동기화가 집어 가지 않도록 임시 이름
  const out = fs.createWriteStream(dest);
  let size = 0; let aborted = false;
  req.on('data', (c) => { size += c.length; if (size > MAX_UPLOAD && !aborted) { aborted = true; req.destroy(); out.destroy(); fs.rm(dest, { force: true }, () => {}); send(res, 413, { error: '파일이 너무 큽니다' }); } });
  req.on('aborted', () => { aborted = true; out.destroy(); fs.rm(dest, { force: true }, () => {}); });
  req.pipe(out);
  out.on('finish', async () => {
    if (aborted) return;
    if (!size) { fs.rmSync(dest, { force: true }); return send(res, 400, { error: '빈 파일입니다' }); }
    fs.renameSync(dest, final);
    const v = newVideo({
      file: stored,
      title: url.searchParams.get('title') || path.parse(name).name,
      description: url.searchParams.get('description') || '',
      author: url.searchParams.get('author') || '미믹',
    });
    db.videos.push(v);
    await finishVideo(v);
    send(res, 201, publicVideo(v));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = decodeURIComponent(url.pathname);
  try {
    // API
    if (p === '/api/videos' && req.method === 'GET') {
      await syncFolder();
      const q = (url.searchParams.get('q') || '').trim().toLowerCase();
      let list = db.videos;
      if (q) list = list.filter((v) => `${v.title} ${v.description} ${v.author}`.toLowerCase().includes(q));
      const sort = url.searchParams.get('sort');
      list = [...list].sort(sort === 'popular' ? (a, b) => b.views - a.views : (a, b) => b.createdAt.localeCompare(a.createdAt));
      return send(res, 200, list.map(publicVideo));
    }
    if (p === '/api/upload' && req.method === 'POST') return handleUpload(req, res, url);

    const m = /^\/api\/videos\/([\w-]+)(?:\/(view|like|comments))?$/.exec(p);
    if (m) {
      const v = db.videos.find((x) => x.id === m[1]);
      if (!v) return send(res, 404, { error: '영상을 찾지 못했습니다' });
      const action = m[2];
      if (!action && req.method === 'GET') return send(res, 200, { ...publicVideo(v), comments: v.comments });
      if (!action && req.method === 'PATCH') {
        const body = await readJson(req);
        if (typeof body.title === 'string' && body.title.trim()) v.title = body.title.trim().slice(0, 120);
        if (typeof body.description === 'string') v.description = body.description.slice(0, 5000);
        saveDb(db); return send(res, 200, publicVideo(v));
      }
      if (!action && req.method === 'DELETE') {
        db.videos = db.videos.filter((x) => x.id !== v.id);
        fs.rmSync(path.join(VIDEOS, v.file), { force: true });
        fs.rmSync(path.join(THUMBS, `${v.id}.jpg`), { force: true });
        saveDb(db); return send(res, 200, { ok: true });
      }
      if (action === 'view' && req.method === 'POST') { v.views++; saveDb(db); return send(res, 200, { views: v.views }); }
      if (action === 'like' && req.method === 'POST') {
        const body = await readJson(req);
        v.likes = Math.max(0, v.likes + (body.undo ? -1 : 1)); saveDb(db); return send(res, 200, { likes: v.likes });
      }
      if (action === 'comments' && req.method === 'POST') {
        const body = await readJson(req);
        const text = String(body.text || '').trim().slice(0, 1000);
        if (!text) return send(res, 400, { error: '댓글 내용을 입력하세요' });
        const c = { id: crypto.randomBytes(4).toString('hex'), author: String(body.author || '익명').trim().slice(0, 40) || '익명', text, createdAt: new Date().toISOString() };
        v.comments.unshift(c); saveDb(db); return send(res, 201, c);
      }
      return send(res, 405, { error: 'Method not allowed' });
    }

    // 파일
    if (p.startsWith('/media/')) {
      const f = safeJoin(VIDEOS, p.slice(7));
      return f ? serveFile(req, res, f) : send(res, 400, 'Bad path');
    }
    if (p.startsWith('/thumbs/')) {
      const f = safeJoin(THUMBS, p.slice(8));
      return f ? serveFile(req, res, f, 'max-age=3600') : send(res, 400, 'Bad path');
    }
    if (p.startsWith('/api/')) return send(res, 404, { error: 'Not found' });
    const f = p === '/' ? path.join(PUBLIC, 'index.html') : safeJoin(PUBLIC, p.slice(1));
    if (f && fs.existsSync(f) && fs.statSync(f).isFile()) return serveFile(req, res, f);
    return serveFile(req, res, path.join(PUBLIC, 'index.html')); // SPA
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`미믹 튜브: http://localhost:${PORT}  (영상 폴더: ${VIDEOS}${hasFfmpeg ? '' : ' · ffmpeg 없음 → 썸네일 없이 동작'})`);
});
