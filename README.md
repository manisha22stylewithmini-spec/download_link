# Grab Video

Paste a link (Pinterest, Dribbble, X, Instagram, YouTube, TikTok, ...) and download the video.

Requires `yt-dlp` and `ffmpeg` (`brew install yt-dlp ffmpeg`).

```bash
node server.js   # http://127.0.0.1:3000
```

## Run on your own computer with your browser login

```bash
GRAB_COOKIES_BROWSER=chrome node server.js
```

This lets Grab use the Instagram/X/etc. accounts you're already logged into in Chrome (macOS may ask to allow keychain access). Only do this on your own machine, never on a public server.
