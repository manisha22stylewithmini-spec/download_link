const $ = id => document.getElementById(id);
let current = null;
let activeUrl = '';
const send = m => new Promise(res => chrome.runtime.sendMessage(m, res));
const say = (t, err) => { $('msg').textContent = t; $('msg').className = err ? 'err' : 'muted'; $('msg').hidden = !t; };

const isIg = u => /^https:\/\/(www\.)?instagram\.com\/(reel|reels|p|tv)\//.test(u);
let activeTabId = null;

async function load(url) {
  $('card').hidden = true;
  say('Finding the video…');
  let r;
  if (isIg(url) && activeTabId != null && url === activeUrl) {
    // Instagram needs the user's own login, so the Instagram tab does the lookup
    r = await chrome.tabs.sendMessage(activeTabId, { type: 'ig-info', url }).catch(() => ({ ok: false, error: 'Reload the Instagram tab, then click Grab again.' }));
    if (r?.ok) r = { ok: true, data: { ...r.data, options: [{ label: 'Best quality', url: r.data.url, ext: r.data.ext, kind: 'video' }] }, direct: true };
  } else r = await send({ type: 'info', url });
  if (!r?.ok) return say(r?.error || 'Something went wrong.', true);
  current = { url, data: r.data, direct: !!r.direct };
  say('');
  $('thumb').src = r.data.thumbnail || '';
  $('thumb').hidden = !r.data.thumbnail;
  $('title').textContent = r.data.title;
  $('sub').textContent = [r.data.source, r.data.uploader].filter(Boolean).join(' · ');
  $('quality').innerHTML = r.data.options.map((o, i) => `<option value="${i}">${o.label}</option>`).join('');
  $('saveAudio').hidden = !r.data.options.some(o => o.kind === 'audio' || /audio/i.test(o.label));
  $('card').hidden = false;
}

async function save(kind) {
  const b = kind === 'audio' ? $('saveAudio') : $('saveVideo');
  [$('saveVideo'), $('saveAudio')].forEach(x => (x.disabled = true));
  const old = b.textContent;
  b.textContent = 'Saving…';
  const r = current.direct
    ? await send({ type: 'save', url: current.data.url, title: current.data.title, ext: current.data.ext })
    : await send({ type: 'grab', url: current.url, kind: kind === 'audio' ? 'audio' : Number($('quality').value) });
  [$('saveVideo'), $('saveAudio')].forEach(x => (x.disabled = false));
  b.textContent = old;
  if (r?.ok) say('Saved to Downloads/Grab ✓'); else say(r?.error || 'Could not save it.', true);
}
$('saveVideo').addEventListener('click', () => save('video'));
$('saveAudio').addEventListener('click', () => save('audio'));
$('manual').addEventListener('submit', e => { e.preventDefault(); if ($('link').value.trim()) load($('link').value.trim()); });

$('gear').addEventListener('click', async () => { $('settings').hidden = !$('settings').hidden; $('api').value = (await chrome.storage.sync.get('api')).api || ''; });
$('saveApi').addEventListener('click', async () => {
  const v = $('api').value.trim().replace(/\/$/, '');
  if (v) {
    const ok = await chrome.permissions.request({ origins: [new URL(v).origin + '/*'] }).catch(() => false);
    if (!ok) return say('Permission to reach that server was not granted.', true);
    await chrome.storage.sync.set({ api: v });
  } else await chrome.storage.sync.remove('api');
  say('Server saved.');
});

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const u = tab?.url || '';
  activeTabId = tab?.id ?? null;
  activeUrl = u;
  if (/^https?:\/\//.test(u) && !/^https:\/\/(www\.)?(google|chrome)\./.test(u)) load(u);
  else say('Open a reel, pin or post, then click Grab. Or paste a link below.');
})();
