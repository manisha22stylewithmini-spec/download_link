// Edge function: streams a media file through our own domain so the app can save it without CORS problems
// and without sending people to another site. Only well-known social-media CDNs are allowed (not an open proxy).
export const config = { runtime: 'edge' };

const ALLOWED = [
  'pinimg.com', 'twimg.com', 'cdninstagram.com', 'instagram.com', 'fbcdn.net', 'facebook.com', 'tiktokcdn.com', 'tiktokcdn-us.com',
  'tiktokv.com', 'tiktok.com', 'byteoversea.com', 'muscdn.com', 'googlevideo.com', 'youtube.com', 'ytimg.com', 'dribbble.com',
  'licdn.com', 'snapchat.com', 'sc-cdn.net', 'vimeocdn.com', 'redd.it', 'redditmedia.com',
];
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MIME = { mp4: 'video/mp4', webm: 'video/webm', m4a: 'audio/mp4', mp3: 'audio/mpeg', mov: 'video/quicktime', jpg: 'image/jpeg' };

function allowed(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  const h = u.hostname.toLowerCase();
  if (/^[\d.]+$/.test(h) || h.includes(':')) return null; // no IP literals
  return ALLOWED.some(d => h === d || h.endsWith('.' + d)) ? u : null;
}
const bad = (status, msg) => new Response(JSON.stringify({ error: msg }), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export default async function handler(req) {
  const p = new URL(req.url).searchParams;
  let target = allowed(p.get('u') || '');
  if (!target) return bad(400, 'That file is not on a supported site.');

  const headers = { 'User-Agent': UA, Accept: '*/*' };
  const ref = allowed(p.get('r') || '');
  headers.Referer = ref ? ref.href : target.origin + '/';

  // follow redirects ourselves so every hop stays on the allow-list
  let res;
  for (let i = 0; i < 4; i++) {
    res = await fetch(target, { headers, redirect: 'manual' }).catch(() => null);
    if (!res) return bad(502, 'Could not reach the video host.');
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      target = allowed(new URL(res.headers.get('location'), target).href);
      if (!target) return bad(400, 'The video moved somewhere we cannot fetch from.');
      continue;
    }
    break;
  }
  if (!res.ok || !res.body) return bad(res.status === 403 ? 403 : 502, 'The site refused the download.');

  const ext = (p.get('e') || 'mp4').replace(/[^a-z0-9]/gi, '').slice(0, 5).toLowerCase() || 'mp4';
  const name = ((p.get('n') || 'video').replace(/[^\w\- ]+/g, '').trim().slice(0, 80) || 'video') + '.' + ext;
  const out = {
    'Content-Type': MIME[ext] || res.headers.get('content-type') || 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${name}"`,
    'Cache-Control': 'no-store',
    'Access-Control-Expose-Headers': 'Content-Disposition, Content-Length',
  };
  const len = res.headers.get('content-length');
  if (len) out['Content-Length'] = len;
  return new Response(res.body, { status: 200, headers: out });
}
