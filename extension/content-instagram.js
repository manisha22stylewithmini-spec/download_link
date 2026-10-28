// Adds a "Grab" tile to Instagram's Share dialog, right next to "Copy link".
(() => {
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
      const r = await chrome.runtime.sendMessage({ type: 'grab', url: postUrl() });
      if (text) text.textContent = r?.ok ? 'Saved ✓' : 'Try again';
      setTimeout(() => text && (text.textContent = 'Grab'), 2500);
    }, true);
    row.insertBefore(grab, tile);
  }

  const scan = () => document.querySelectorAll('[role="dialog"]').forEach(inject);
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  scan();
})();
