const $ = id => document.getElementById(id);
let current = null;
const send = m => new Promise(res => chrome.runtime.sendMessage(m, res));
const say = (t, err) => { $('msg').textContent = t; $('msg').className = err ? 'err' : 'muted'; $('msg').hidden = !t; };

async function load(url) {
  $('card').hidden = true;
  say('Finding the video…');
  const r = await send({ type: 'info', url });
  if (!r?.ok) return say(r?.error || 'Something went wrong.', true);
  current = { url, data: r.data };
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
  const r = await send({ type: 'grab', url: current.url, kind: kind === 'audio' ? 'audio' : Number($('quality').value) });
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
  if (/^https?:\/\//.test(u) && !/^https:\/\/(www\.)?(google|chrome)\./.test(u)) load(u);
  else say('Open a reel, pin or post, then click Grab. Or paste a link below.');
})();
