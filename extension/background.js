// Grab — background worker: finds the video for a page link and saves it with Chrome's own downloader.
const DEFAULT_API = 'https://download-link-manisha22stylewithmini-specs-projects.vercel.app';
const apiBase = async () => ((await chrome.storage.sync.get('api')).api || DEFAULT_API).replace(/\/$/, '');
const safe = t => ((t || 'video').replace(/[^\w\- ]+/g, '').trim().slice(0, 80) || 'video');

async function info(url) {
  let r, d;
  try {
    r = await fetch(`${await apiBase()}/api/info?url=${encodeURIComponent(url)}`);
    d = await r.json();
  } catch {
    throw new Error("Couldn't reach Grab's server. It may still be set to private.");
  }
  if (!r.ok) throw new Error(d.error || 'No video found at that link.');
  if (!d.options?.length) throw new Error('No downloadable video was found at that link.');
  return d;
}

// kind: 'video' (best) | 'low' | 'audio', or an option index
function choose(data, kind) {
  const audio = data.options.map((o, i) => i).filter(i => data.options[i].kind === 'audio' || /audio/i.test(data.options[i].label));
  const video = data.options.map((o, i) => i).filter(i => !audio.includes(i));
  if (typeof kind === 'number') return data.options[kind];
  if (kind === 'audio') return data.options[audio[0] ?? video[0]];
  if (kind === 'low') return data.options[video[video.length - 1] ?? 0];
  return data.options[video[0] ?? 0];
}

async function grab(url, kind = 'video') {
  const data = await info(url);
  const o = choose(data, kind);
  const name = `Grab/${safe(data.title)}.${o.ext || 'mp4'}`;
  const id = await chrome.downloads.download({ url: o.url, filename: name, conflictAction: 'uniquify' });
  return { id, name, title: data.title };
}

const note = (title, message) => chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon-128.png', title, message });

async function grabWithNotice(url) {
  try {
    const r = await grab(url, 'video');
    note('Saving with Grab', r.title);
    return { ok: true, ...r };
  } catch (e) {
    note("Couldn't grab that video", e.message);
    return { ok: false, error: e.message };
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'grab', title: 'Save video with Grab', contexts: ['page', 'link', 'video'] });
});
chrome.contextMenus.onClicked.addListener(i => { if (i.menuItemId === 'grab') grabWithNotice(i.linkUrl || i.pageUrl); });
chrome.commands.onCommand.addListener(async c => {
  if (c !== 'grab-page') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) grabWithNotice(tab.url);
});

chrome.runtime.onMessage.addListener((m, _s, reply) => {
  if (m.type === 'info') info(m.url).then(d => reply({ ok: true, data: d }), e => reply({ ok: false, error: e.message }));
  else if (m.type === 'grab') {
    (m.kind ? grab(m.url, m.kind).then(r => ({ ok: true, ...r }), e => ({ ok: false, error: e.message })) : grabWithNotice(m.url)).then(reply);
  } else return false;
  return true; // keep the channel open for the async reply
});
