"""Vercel serverless function: resolve a page link to direct, downloadable media URLs with yt-dlp."""
import json
import ipaddress
import re
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

import yt_dlp


def validate(raw):
    try:
        u = urlparse(raw)
    except Exception:
        return "That does not look like a valid link."
    if u.scheme not in ("http", "https") or not u.hostname:
        return "Only http(s) links are supported."
    h = u.hostname.lower()
    if h == "localhost" or h.endswith((".localhost", ".local", ".internal")):
        return "Local addresses are not allowed."
    try:
        ip = ipaddress.ip_address(h)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            return "Private addresses are not allowed."
    except ValueError:
        pass
    return None


def friendly(msg):
    msg = re.sub(r"^ERROR:\s*(\[[^\]]+\]\s*)?", "", msg.strip())
    low = msg.lower()
    if any(k in low for k in ("login", "private", "sign in", "cookies", "confirm you")):
        return "This video is private, needs a login, or the site is blocking this server, so it cannot be downloaded."
    if "unsupported url" in low:
        return "No downloadable video was found at that link."
    return msg[:300] or "Could not read that link."


def build(info):
    formats = info.get("formats") or [info]
    direct = lambda f: f.get("url") and f.get("protocol") in ("https", "http")
    both = [f for f in formats if direct(f) and f.get("vcodec") not in (None, "none") and f.get("acodec") not in (None, "none")]
    by_height = {}
    for f in both:
        h = f.get("height") or 0
        cur = by_height.get(h)
        if not cur or (f.get("tbr") or 0) > (cur.get("tbr") or 0):
            by_height[h] = f
    options = []
    for h in sorted(by_height, reverse=True):
        f = by_height[h]
        options.append({"label": f"{h}p" if h else "Video", "url": f["url"], "ext": f.get("ext") or "mp4", "headers": f.get("http_headers") or {}})
    if options:
        options[0]["label"] = "Best quality" + (f" ({options[0]['label']})" if options[0]["label"] != "Video" else "")
    audio = [f for f in formats if direct(f) and f.get("vcodec") in (None, "none") and f.get("acodec") not in (None, "none")]
    if audio:
        a = max(audio, key=lambda f: f.get("abr") or 0)
        options.append({"label": "Audio only", "url": a["url"], "ext": a.get("ext") or "m4a", "headers": {}})
    return options


class handler(BaseHTTPRequestHandler):
    def _send(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        url = (parse_qs(urlparse(self.path).query).get("url") or [""])[0].strip()
        bad = validate(url)
        if bad:
            return self._send(400, {"error": bad})
        try:
            with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True, "noplaylist": True, "skip_download": True, "socket_timeout": 15}) as ydl:
                info = ydl.extract_info(url, download=False)
            options = build(info)
            if not options:
                return self._send(422, {"error": "No directly downloadable video file was found at that link."})
            self._send(200, {
                "title": info.get("title") or "video",
                "uploader": info.get("uploader") or info.get("channel") or "",
                "thumbnail": info.get("thumbnail") or "",
                "duration": info.get("duration"),
                "source": info.get("extractor_key") or "",
                "options": options,
            })
        except Exception as e:
            self._send(422, {"error": friendly(str(e))})
