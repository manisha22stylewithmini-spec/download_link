"""Vercel serverless function: keyword search.

YouTube can be searched directly with yt-dlp, so it returns real results.
Instagram, TikTok, Pinterest, X, Dribbble and Facebook don't allow outside search,
so for those we return a link to the platform's own search page for that keyword.
"""
import json
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, quote

import yt_dlp

EXTERNAL = {
    "instagram": ("Instagram", "https://www.instagram.com/explore/search/keyword/?q={q}"),
    "tiktok": ("TikTok", "https://www.tiktok.com/search/video?q={q}"),
    "pinterest": ("Pinterest", "https://www.pinterest.com/search/videos/?q={q}"),
    "x": ("X", "https://x.com/search?q={q}%20filter%3Avideos&f=live"),
    "dribbble": ("Dribbble", "https://dribbble.com/search/{q}"),
    "facebook": ("Facebook", "https://www.facebook.com/search/videos/?q={q}"),
}


def youtube(q, n=12):
    opts = {"quiet": True, "no_warnings": True, "extract_flat": True, "skip_download": True, "socket_timeout": 12}
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(f"ytsearch{n}:{q}", download=False)
    items = []
    for e in info.get("entries") or []:
        vid = e.get("id")
        if not vid:
            continue
        items.append({
            "title": e.get("title") or "Video",
            "url": e.get("url") if str(e.get("url", "")).startswith("http") else f"https://www.youtube.com/watch?v={vid}",
            "thumbnail": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
            "channel": e.get("channel") or e.get("uploader") or "",
            "duration": e.get("duration"),
            "platform": "YouTube",
        })
    return items


def links(q, only=None):
    enc = quote(q)
    return [{"platform": name, "key": k, "url": tpl.format(q=enc)} for k, (name, tpl) in EXTERNAL.items() if only in (None, k)]


class handler(BaseHTTPRequestHandler):
    def _send(self, code, body, cache=False):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "public, s-maxage=900, stale-while-revalidate=3600" if cache else "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        p = parse_qs(urlparse(self.path).query)
        q = (p.get("q") or [""])[0].strip()[:80]
        platform = (p.get("platform") or ["all"])[0].lower()
        if not q:
            return self._send(400, {"error": "Type something to search for."})
        if platform in EXTERNAL:
            return self._send(200, {"q": q, "platform": platform, "items": [], "external": links(q, platform)}, cache=True)
        try:
            items = youtube(q)
        except Exception:
            items = []
        ext = links(q) if platform == "all" else []
        if not items and platform == "youtube":
            return self._send(502, {"error": "Search is busy right now. Try again in a moment."})
        self._send(200, {"q": q, "platform": platform, "items": items, "external": ext}, cache=bool(items))
