// Adds a "Grab" tile to Instagram's Share dialog, right next to "Copy link".
(() => {
  // Instagram only serves reels to logged-in browsers, so we ask Instagram ourselves, from the page, using the user's own session.
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const shortcodeOf = u => /\/(?:reel|reels|p|tv)\/([\w-]+)/.exec(u)?.[1];
  const mediaId = sc => { let id = 0n; for (const ch of sc) id = id * 64n + BigInt(ALPHA.indexOf(ch)); return id.toString(); };

  async function igInfo(url) {
    const sc = shortcodeOf(url);
    if (!sc) throw new Error('Open a reel or post first.');
    const r = await fetch(`/api/v1/media/${mediaId(sc)}/info/`, {
      credentials: 'include',
      headers: { 'x-ig-app-id': '936619743392459', 'x-requested-with': 'XMLHttpRequest', accept: '*/*' },
    });
    if (r.status === 401 || r.status === 403) throw new Error('Log in to Instagram in this browser, then try again.');
    if (!r.ok) throw new Error('Instagram would not share this post right now.');
    const j = await r.json();
    const it = j.items?.[0];
    const best = (it?.video_versions || [])[0] || it?.carousel_media?.find(m => m.video_versions)?.video_versions?.[0];
    if (!best?.url) throw new Error('This post has no video.');
    const thumb = it.image_versions2?.candidates?.[0]?.url || '';
    const title = (it.caption?.text || '').split('\n')[0].slice(0, 90) || `Instagram ${sc}`;
    return { title, uploader: it.user?.username || '', thumbnail: thumb, url: best.url, ext: 'mp4', source: 'Instagram' };
  }
  chrome.runtime.onMessage.addListener((m, _s, reply) => {
    if (m.type !== 'ig-info') return false;
    igInfo(m.url || location.href).then(d => reply({ ok: true, data: d }), e => reply({ ok: false, error: e.message }));
    return true;
  });

  const ICON = chrome.runtime.getURL('icons/icon-48.png');
  const postUrl = () => {
    const here = location.href.split('?')[0];
    if (/\/(reel|reels|p|tv)\/[\w-]+/.test(here)) return here;
    // feed / reels viewer: use the post link nearest the middle of the screen
    const links = [...document.querySelectorAll('a[href*="/reel/"], a[href*="/p/"]')];
    const mid = innerHeight / 2;
    links.sort((a, b) => Math.abs(a.getBoundingClientRect().top - mid) - Math.abs(b.getBoundingClientRect().top - mid));
    return links[0]?.href.split('?')[0] || here;
  };

  function inject(dialog) {
    if (dialog.querySelector('[data-grab]')) return;
    const label = [...dialog.querySelectorAll('span, div')].find(e => !e.children.length && /^copy link$/i.test(e.textContent.trim()));
    if (!label) return;
    let tile = label;
    while (tile.parentElement && tile.parentElement !== dialog && tile.parentElement.children.length < 3) tile = tile.parentElement;
    const row = tile.parentElement;
    if (!row) return;
    const grab = tile.cloneNode(true);
    grab.dataset.grab = '1';
    const text = [...grab.querySelectorAll('span, div')].find(e => !e.children.length && /^copy link$/i.test(e.textContent.trim()));
    if (text) text.textContent = 'Grab';
    const svg = grab.querySelector('svg');
    if (svg) {
      const img = new Image();
      img.src = ICON;
      img.alt = '';
      img.style.cssText = 'width:30px;height:30px;border-radius:8px';
      svg.replaceWith(img);
    }
    grab.addEventListener('click', async e => {
      e.preventDefault(); e.stopPropagation();
      if (text) text.textContent = 'Saving…';
      let r;
      try {
        const d = await igInfo(postUrl());
        r = await chrome.runtime.sendMessage({ type: 'save', url: d.url, title: d.title, ext: d.ext });
      } catch (err) { r = { ok: false, error: err.message }; }
      if (!r?.ok && r?.error) chrome.runtime.sendMessage({ type: 'notice', title: "Couldn't grab that video", message: r.error });
      if (text) text.textContent = r?.ok ? 'Saved ✓' : 'Try again';
      setTimeout(() => text && (text.textContent = 'Grab'), 2500);
    }, true);
    row.insertBefore(grab, tile);
  }

  const scan = () => document.querySelectorAll('[role="dialog"]').forEach(inject);
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  scan();
})();
