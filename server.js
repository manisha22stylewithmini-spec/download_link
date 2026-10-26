// Video downloader server — no npm dependencies. Requires yt-dlp (and ffmpeg for merging) on PATH.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 3000;
const HOST = '127.0.0.1';
const PUBLIC = path.join(__dirname, 'public');
const TIMEOUT_MS = 5 * 60 * 1000;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml',
};

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// Only allow public http(s) URLs so the server can't be pointed at local/internal services.
function validateUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return 'That does not look like a valid link.'; }
  if (!/^https?:$/.test(u.protocol)) return 'Only http(s) links are supported.';
  const h = u.hostname.replace(/^\[|\]$/g, '');
  const ipv = net.isIP(h);
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return 'Local addresses are not allowed.';
  if (ipv === 4 && /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return 'Private addresses are not allowed.';
  if (ipv === 6 && /^(::1?$|f[cd]|fe80)/i.test(h)) return 'Private addresses are not allowed.';
  return null;
}

function run(args, { timeout = TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    const t = setTimeout(() => p.kill('SIGKILL'), timeout);
    p.stdout.on('data', d => (out += d));
    p.stderr.on('data', d => (err += d));
    p.on('error', e => { clearTimeout(t); reject(new Error(e.code === 'ENOENT' ? 'yt-dlp is not installed on the server.' : e.message)); });
    p.on('close', code => {
      clearTimeout(t);
      if (code === 0) resolve(out);
      else reject(new Error(friendlyError(err)));
    });
  });
}

function friendlyError(stderr) {
  const line = stderr.split('\n').reverse().find(l => l.startsWith('ERROR')) || stderr.trim().split('\n').pop() || 'Download failed.';
  const msg = line.replace(/^ERROR:\s*(\[[^\]]+\]\s*)?/, '').trim();
  if (/login|private|sign in|cookies/i.test(msg)) return 'This video is private or requires a login, so it cannot be downloaded.';
  if (/unsupported url/i.test(msg)) return 'No downloadable video was found at that link.';
  return msg.slice(0, 300);
}

async function handleInfo(req, res, url) {
  const bad = validateUrl(url);
  if (bad) return json(res, 400, { error: bad });
  try {
    const out = await run(['-J', '--no-playlist', '--no-warnings', url], { timeout: 60000 });
    const info = JSON.parse(out);
    const heights = [...new Set((info.formats || []).filter(f => f.vcodec && f.vcodec !== 'none' && f.height).map(f => f.height))].sort((a, b) => b - a);
    json(res, 200, {
      title: info.title || 'video',
      uploader: info.uploader || info.channel || '',
      thumbnail: info.thumbnail || '',
      duration: info.duration || null,
      source: info.extractor_key || '',
      heights,
      hasVideo: heights.length > 0 || (info.vcodec && info.vcodec !== 'none'),
    });
  } catch (e) {
    json(res, 422, { error: e.message });
  }
}

async function handleDownload(req, res, params) {
  const url = params.get('url') || '';
  const quality = params.get('quality') || 'best';
  const bad = validateUrl(url);
  if (bad) return json(res, 400, { error: bad });

  let fmt, ext;
  if (quality === 'audio') { fmt = 'bestaudio/best'; ext = 'mp3'; }
  else {
    const h = parseInt(quality, 10);
    fmt = Number.isFinite(h) ? `bv*[height<=${h}]+ba/b[height<=${h}]/b` : 'bv*+ba/b';
    ext = 'mp4';
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vdl-'));
  const cleanup = () => fs.rm(dir, { recursive: true, force: true }, () => {});
  const args = ['--no-playlist', '--no-warnings', '-f', fmt, '-o', path.join(dir, 'out.%(ext)s'), '--max-filesize', '2G'];
  if (ext === 'mp3') args.push('-x', '--audio-format', 'mp3');
  else args.push('--merge-output-format', 'mp4', '--remux-video', 'mp4');
  args.push(url);

  try {
    await run(args);
    const file = fs.readdirSync(dir).find(f => f.startsWith('out.'));
    if (!file) throw new Error('Download produced no file.');
    const full = path.join(dir, file);
    const size = fs.statSync(full).size;
    const title = (params.get('title') || 'video').replace(/[^\w\- ]+/g, '').trim().slice(0, 80) || 'video';
    res.writeHead(200, {
      'Content-Type': ext === 'mp3' ? 'audio/mpeg' : 'video/mp4',
      'Content-Length': size,
      'Content-Disposition': `attachment; filename="${title}.${path.extname(file).slice(1)}"`,
    });
    const rs = fs.createReadStream(full);
    rs.pipe(res);
    res.on('close', cleanup);
  } catch (e) {
    cleanup();
    json(res, 422, { error: e.message });
  }
}

http.createServer((req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);
  if (u.pathname === '/api/info') return handleInfo(req, res, u.searchParams.get('url') || '');
  if (u.pathname === '/api/download') return handleDownload(req, res, u.searchParams);

  const rel = u.pathname === '/' ? 'index.html' : u.pathname.slice(1);
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, HOST, () => console.log(`Video downloader running at http://${HOST}:${PORT}`));
