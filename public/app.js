const $ = id => document.getElementById(id);
let current = null;

/* ---------- small helpers ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('gv.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('gv.' + k, JSON.stringify(v)); } catch {} },
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = u => (/^https?:\/\//i.test(u || '') ? u : '#');

function fmtDuration(s) {
  if (!s) return '';
  const m = Math.floor(s / 60), sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
function timeAgo(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString();
}

// Platforms the app knows about: key → [label, logo file or null, searchable inside the app]
const PLATFORMS = {
  youtube: ['YouTube', 'youtube', true], instagram: ['Instagram', 'instagram', false], tiktok: ['TikTok', 'tiktok', false],
  pinterest: ['Pinterest', 'pinterest', false], x: ['X', 'x', false], dribbble: ['Dribbble', 'dribbble', false],
  facebook: ['Facebook', 'facebook', false], snapchat: ['Snapchat', 'snapchat', false], linkedin: ['LinkedIn', 'linkedin', false],
};
function platformKey(source = '', url = '') {
  const s = (source + ' ' + url).toLowerCase();
  if (/youtu/.test(s)) return 'youtube';
  if (/instagram/.test(s)) return 'instagram';
  if (/tiktok/.test(s)) return 'tiktok';
  if (/pinterest|pin\.it/.test(s)) return 'pinterest';
  if (/twitter|x\.com|twimg/.test(s)) return 'x';
  if (/dribbble/.test(s)) return 'dribbble';
  if (/facebook|fb\.watch/.test(s)) return 'facebook';
  if (/snapchat/.test(s)) return 'snapchat';
  if (/linkedin/.test(s)) return 'linkedin';
  return 'other';
}
const platformLabel = k => PLATFORMS[k]?.[0] || 'Other';
const logo = k => (PLATFORMS[k] ? `<img class="pl-logo" src="/logos/${PLATFORMS[k][1]}.png" alt="" width="24" height="24">` : '<span class="pl-logo other" aria-hidden="true">↗</span>');

/* ---------- settings + theme ---------- */
const settings = Object.assign({ quality: 'best', autoShare: true, theme: localStorage.getItem('theme') || 'system' }, store.get('settings', {}));
const saveSettings = () => store.set('settings', settings);
const darkMQ = matchMedia('(prefers-color-scheme: dark)');

function applyTheme(mode) {
  settings.theme = mode;
  saveSettings();
  const t = mode === 'system' ? (darkMQ.matches ? 'dark' : 'light') : mode;
  document.documentElement.dataset.theme = t;
  $('theme').setAttribute('aria-label', t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  try { mode === 'system' ? localStorage.removeItem('theme') : localStorage.setItem('theme', mode); } catch {}
  syncSeg();
}
darkMQ.addEventListener?.('change', () => settings.theme === 'system' && applyTheme('system'));
$('theme').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));

function syncSeg() {
  document.querySelectorAll('.seg').forEach(seg => {
    seg.querySelectorAll('[role=radio]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === settings[seg.dataset.key])));
  });
}
document.querySelectorAll('.seg').forEach(seg => seg.addEventListener('click', e => {
  const b = e.target.closest('[role=radio]');
  if (!b) return;
  if (seg.dataset.key === 'theme') return applyTheme(b.dataset.v);
  settings[seg.dataset.key] = b.dataset.v;
  saveSettings();
  syncSeg();
  toast(seg.dataset.key === 'quality' ? `Default quality: ${b.textContent}` : 'Saved');
}));
$('setAuto').checked = settings.autoShare;
$('setAuto').addEventListener('change', e => { settings.autoShare = e.target.checked; saveSettings(); });
applyTheme(settings.theme);

/* ---------- toast ---------- */
let toastTimer;
function toast(msg) {
  let t = $('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------- tabs (hash routing so the back button works) ---------- */
const TABS = ['home', 'history', 'settings', 'alerts'];
function showTab(name, { push = true } = {}) {
  if (!TABS.includes(name)) name = 'home';
  TABS.forEach(t => {
    $('view-' + t).hidden = t !== name;
    const tab = $('tab-' + t);
    tab.setAttribute('aria-selected', String(t === name));
    tab.tabIndex = t === name ? 0 : -1;
  });
  if (push && location.hash.slice(1) !== name) history.pushState(null, '', name === 'home' ? location.pathname : '#' + name);
  if (name === 'history') renderHistory();
  if (name === 'alerts') renderAlerts();
  window.scrollTo({ top: 0 });
}
document.querySelector('.tabbar').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });
document.querySelector('.tabbar').addEventListener('keydown', e => {
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const i = TABS.indexOf(document.querySelector('.tabbar [aria-selected=true]').dataset.tab);
  const n = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
  showTab(n);
  $('tab-' + n).focus();
});
document.addEventListener('click', e => { const g = e.target.closest('[data-goto]'); if (g) showTab(g.dataset.goto); });
addEventListener('popstate', () => showTab(location.hash.slice(1) || 'home', { push: false }));

/* ---------- paste + lookup ---------- */
function showError(msg) { $('error').textContent = msg; $('error').hidden = !msg; }

$('paste').addEventListener('click', async () => {
  try { $('url').value = (await navigator.clipboard.readText()).trim(); $('url').focus(); }
  catch { $('url').focus(); }
});
$('form').addEventListener('submit', e => { e.preventDefault(); lookup($('url').value.trim()); });

// Used by search results, suggestions and history: load a link into the downloader.
function useLink(url) {
  showTab('home');
  $('url').value = url;
  lookup(url);
}

async function lookup(url) {
  showError('');
  $('result').hidden = true;
  $('go').disabled = true;
  $('go').textContent = '…';
  try {
    const r = await fetch('/api/info?url=' + encodeURIComponent(url));
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Something went wrong.');
    current = { url, ...data, platform: platformKey(data.source, url) };
    $('thumb').src = data.thumbnail || '';
    $('thumb').hidden = !data.thumbnail;
    $('title').textContent = data.title;
    $('detail').textContent = [data.source, data.uploader, fmtDuration(data.duration)].filter(Boolean).join(' · ');
    const q = $('quality');
    q.innerHTML = '';
    if (data.options) {
      data.options.forEach((o, i) => q.add(new Option(o.label, String(i))));
    } else {
      q.add(new Option('Best quality', 'best'));
      data.heights.forEach(h => q.add(new Option(h + 'p', String(h))));
      q.add(new Option('Audio only (MP3)', 'audio'));
    }
    applyDefaultQuality();
    $('result').hidden = false;
    $('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return true;
  } catch (err) {
    showError(err.message);
    return false;
  } finally {
    $('go').disabled = false;
    $('go').textContent = '→';
  }
}

// Pre-select the option that matches the "Default quality" setting.
function applyDefaultQuality() {
  const opts = [...$('quality').options];
  const audio = opts.findIndex(o => /audio/i.test(o.text));
  const videos = opts.map((o, i) => i).filter(i => i !== audio);
  let i = 0;
  if (settings.quality === 'audio' && audio >= 0) i = audio;
  else if (settings.quality === 'low' && videos.length) i = videos[videos.length - 1];
  $('quality').selectedIndex = i;
  if (typeof ddRender === 'function') ddRender();
}

// Hosted mode: the server only resolves the media URL, the browser fetches the file itself.
async function directDownload(opt, title, auto = false) {
  const name = (title || 'video').replace(/[^\w\- ]+/g, '').trim().slice(0, 80) || 'video';
  try {
    const r = await fetch(opt.url);
    if (!r.ok) throw new Error('blocked');
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.${opt.ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch {
    // The host doesn't allow in-page downloads. Without a tap, browsers block pop-ups, so ask for one.
    if (auto) throw new Error('Ready! Tap Download to save the video.');
    // Otherwise open the file so it can be saved from the browser.
    window.open(opt.url, '_blank', 'noopener');
    showError('Your browser opened the video in a new tab. Right-click it (or use the ⋮ menu) and choose "Save video as".');
  }
}

$('dl').addEventListener('click', e => { e.preventDefault(); startDownload(); });

async function startDownload(auto = false) {
  if (!current) return;
  const btn = $('dl');
  const quality = $('quality').options[$('quality').selectedIndex]?.text || '';
  btn.classList.add('busy');
  btn.textContent = 'Preparing…';
  $('note').hidden = false;
  showError('');
  try {
    if (current.options) {
      await directDownload(current.options[Number($('quality').value)], current.title, auto);
    } else {
      const qs = new URLSearchParams({ url: current.url, quality: $('quality').value, title: current.title });
      const r = await fetch('/api/download?' + qs);
      if (!r.ok) throw new Error((await r.json()).error || 'Download failed.');
      const blob = await r.blob();
      const name = /filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') || '')?.[1] || 'video.mp4';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    }
    addHistory({ ...current, quality });
    toast('Saved to History');
  } catch (err) {
    showError(err.message);
  } finally {
    btn.classList.remove('busy');
    btn.textContent = 'Download';
    $('note').hidden = true;
  }
}

/* ---------- history ---------- */
let historyFilter = 'all';
function addHistory(v) {
  const list = store.get('history', []).filter(h => h.url !== v.url);
  list.unshift({ id: Date.now().toString(36), title: v.title, url: v.url, platform: v.platform, uploader: v.uploader || '', thumb: v.thumbnail || '', quality: v.quality, at: Date.now() });
  store.set('history', list.slice(0, 300));
  syncMeta();
}
function renderHistory() {
  const list = store.get('history', []);
  const counts = list.reduce((m, h) => ((m[h.platform] = (m[h.platform] || 0) + 1), m), {});
  if (historyFilter !== 'all' && !counts[historyFilter]) historyFilter = 'all';
  $('historyFilter').innerHTML = list.length
    ? [['all', `All · ${list.length}`], ...Object.keys(counts).map(k => [k, `${platformLabel(k)} · ${counts[k]}`])]
        .map(([k, label]) => `<button type="button" role="radio" class="chip-btn" data-k="${esc(k)}" aria-checked="${k === historyFilter}">${k === 'all' ? '' : logo(k)}${esc(label)}</button>`).join('')
    : '';
  const shown = list.filter(h => historyFilter === 'all' || h.platform === historyFilter);
  $('historyList').innerHTML = shown.map(h => `
    <li class="hist-item" data-id="${esc(h.id)}">
      <div class="hist-thumb">${h.thumb ? `<img src="${esc(safeUrl(h.thumb))}" alt="" loading="lazy">` : ''}${logo(h.platform)}</div>
      <div class="hist-body">
        <b>${esc(h.title)}</b>
        <span>${esc([platformLabel(h.platform), h.uploader, h.quality].filter(Boolean).join(' · '))}</span>
        <time>${timeAgo(h.at)}</time>
      </div>
      <div class="hist-actions">
        <button type="button" class="mini-btn" data-act="again" aria-label="Download again">↓</button>
        <a class="mini-btn" href="${esc(safeUrl(h.url))}" target="_blank" rel="noopener" aria-label="Open original post">↗</a>
        <button type="button" class="mini-btn" data-act="del" aria-label="Remove from history">✕</button>
      </div>
    </li>`).join('');
  $('historyEmpty').hidden = list.length > 0;
  $('clearHistory').hidden = !list.length;
}
$('historyFilter').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) { historyFilter = b.dataset.k; renderHistory(); } });
$('historyList').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const id = b.closest('.hist-item').dataset.id;
  const list = store.get('history', []);
  const item = list.find(h => h.id === id);
  if (b.dataset.act === 'again' && item) useLink(item.url);
  if (b.dataset.act === 'del') { store.set('history', list.filter(h => h.id !== id)); renderHistory(); }
});
const clearHistory = () => {
  if (!confirm('Clear your download history? Your saved video files stay where they are.')) return;
  store.set('history', []);
  renderHistory();
  toast('History cleared');
};
$('clearHistory').addEventListener('click', clearHistory);
$('clearHistory2').addEventListener('click', clearHistory);

/* ---------- search ---------- */
let searchPlatform = 'all';
const SEARCH_CHIPS = ['all', 'youtube', 'instagram', 'tiktok', 'pinterest', 'x', 'dribbble', 'facebook'];
$('platformChips').innerHTML = SEARCH_CHIPS.map(k =>
  `<button type="button" role="radio" class="chip-btn" data-k="${k}" aria-checked="${k === 'all'}">${k === 'all' ? '' : logo(k)}${k === 'all' ? 'All' : platformLabel(k)}</button>`).join('');
$('platformChips').addEventListener('click', e => {
  const b = e.target.closest('[data-k]');
  if (!b) return;
  searchPlatform = b.dataset.k;
  $('platformChips').querySelectorAll('[data-k]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
  if ($('q').value.trim()) runSearch($('q').value.trim());
});
$('searchForm').addEventListener('submit', e => { e.preventDefault(); const q = $('q').value.trim(); if (q) runSearch(q); });

const cardHTML = it => `
  <article class="vcard">
    <button type="button" class="vthumb" data-url="${esc(it.url)}" aria-label="Grab ${esc(it.title)}">
      <img src="${esc(safeUrl(it.thumbnail))}" alt="" loading="lazy">
      ${it.duration ? `<span class="dur">${fmtDuration(it.duration)}</span>` : ''}
      <span class="vbadge">${logo(platformKey(it.platform))}</span>
    </button>
    <b>${esc(it.title)}</b>
    <span>${esc(it.channel || '')}</span>
  </article>`;
const externalHTML = ext => ext.map(x =>
  `<a class="ext" href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener">${logo(x.key)}<span>Search on ${esc(x.platform)}</span><i>↗</i></a>`).join('');

async function runSearch(q) {
  logSearch(q, searchPlatform);
  const out = $('searchOut');
  out.innerHTML = `<div class="cards">${'<div class="vcard skel"><span></span><b></b><i></i></div>'.repeat(4)}</div>`;
  try {
    const r = await fetch(`/api/search?platform=${encodeURIComponent(searchPlatform)}&q=${encodeURIComponent(q)}`);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Search failed.');
    let html = '';
    if (data.items.length) html += `<p class="hint">Results for “${esc(q)}” · tap a video to grab it</p><div class="cards">${data.items.map(cardHTML).join('')}</div>`;
    if (data.external.length) {
      html += data.items.length
        ? `<p class="hint">Also look on</p>`
        : `<div class="notice"><b>${esc(platformLabel(searchPlatform))} keeps search inside its own app.</b> Open the results there, then share or paste a video link back into Grab.</div>`;
      html += `<div class="exts">${externalHTML(data.external)}</div>`;
    }
    out.innerHTML = html || `<p class="hint">No results for “${esc(q)}”. Try another word.</p>`;
  } catch (err) {
    out.innerHTML = `<p class="hint err">${esc(err.message)}</p>`;
  }
}
document.addEventListener('click', e => { const t = e.target.closest('.vthumb[data-url]'); if (t) useLink(t.dataset.url); });

/* ---------- interests + "For you" ---------- */
const TRENDING = ['reel transitions', 'UI animation', 'outfit ideas', 'street food', 'travel edits', 'motion design', 'gym motivation', 'lofi edits'];
const STOP = new Set('the and for with from this that your you are how what when why into over about video videos reel reels official full new best top part edit edits shorts short live music song feat ft vs'.split(' '));
const personal = () => !!store.get('consent', null)?.accepted && store.get('personal', false);

function logSearch(q, platform) {
  const list = store.get('searches', []).filter(s => s.q.toLowerCase() !== q.toLowerCase());
  list.unshift({ q, platform, at: Date.now() });
  store.set('searches', list.slice(0, 50));
  syncMeta();
}
// Score topics from what the user searches (strong signal), downloads (weaker) and adds by hand (strongest).
function interests() {
  const score = new Map(), add = (k, w) => { k = k.trim().toLowerCase(); if (k.length > 2 && !STOP.has(k)) score.set(k, (score.get(k) || 0) + w); };
  store.get('manual', []).forEach(k => add(k, 10));
  store.get('searches', []).forEach((s, i) => add(s.q, Math.max(1, 5 - i * 0.2)));
  store.get('history', []).slice(0, 60).forEach(h => (h.title || '').toLowerCase().match(/[a-z][a-z0-9]{3,}/g)?.forEach(w => add(w, 0.5)));
  const hidden = new Set(store.get('hidden', []));
  // a word from titles alone (0.5 each) only counts once it shows up in two or more downloads
  return [...score.entries()].filter(([k, v]) => !hidden.has(k) && v >= 1).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k]) => k);
}
function topPlatform() {
  const c = store.get('history', []).reduce((m, h) => ((m[h.platform] = (m[h.platform] || 0) + 1), m), {});
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0];
}

function renderTopics() {
  const mine = personal() ? interests().slice(0, 4) : [];
  const list = [...new Set([...mine, ...TRENDING])].slice(0, 10);
  $('topics').innerHTML = list.map(t => `<button type="button" class="chip-btn topic${mine.includes(t) ? ' mine' : ''}" data-topic="${esc(t)}">${mine.includes(t) ? '✦ ' : '# '}${esc(t)}</button>`).join('');
}
$('topics').addEventListener('click', e => {
  const b = e.target.closest('[data-topic]');
  if (!b) return;
  $('q').value = b.dataset.topic;
  runSearch(b.dataset.topic);
  $('searchHead').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

async function loadForYou() {
  renderTopics();
  const mine = personal() ? interests() : [];
  const topic = mine.length ? mine[Math.floor(Math.random() * Math.min(3, mine.length))] : TRENDING[Math.floor(Math.random() * TRENDING.length)];
  const fav = topPlatform();
  $('fyHint').innerHTML = mine.length
    ? `Because you're into <b>${esc(topic)}</b>${fav && fav !== 'other' ? ` and grab a lot from ${esc(platformLabel(fav))}` : ''}.`
    : personal() ? 'Search or download a few videos and picks for your niche will show up here.'
      : `Trending picks. <button type="button" class="link-btn" data-goto="alerts">Turn on personalized picks</button>`;
  $('forYou').innerHTML = '<div class="vcard skel"><span></span><b></b><i></i></div>'.repeat(4);
  try {
    const r = await fetch(`/api/search?platform=youtube&q=${encodeURIComponent(topic)}`);
    const data = await r.json();
    if (!r.ok || !data.items.length) throw new Error();
    $('forYou').innerHTML = data.items.slice(0, 6).map(cardHTML).join('');
    return { topic, items: data.items };
  } catch {
    $('forYou').innerHTML = '<p class="hint">Suggestions are taking a break. Try Refresh in a moment.</p>';
    return null;
  }
}
$('refreshFy').addEventListener('click', loadForYou);

/* custom quality dropdown (native <select #quality> stays the source of truth) */
const dd = { open: false, idx: 0 };
const ddBtn = $('ddBtn'), ddList = $('ddList'), sel = $('quality');
const TICK = '<svg class="tick" viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg>';

function ddRender() {
  ddList.innerHTML = '';
  [...sel.options].forEach((o, i) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.id = 'dd-opt-' + i;
    li.setAttribute('aria-selected', String(o.selected));
    li.innerHTML = TICK + '<span></span>';
    li.lastChild.textContent = o.text;
    li.addEventListener('mousedown', e => e.preventDefault());
    li.addEventListener('click', () => ddChoose(i));
    li.addEventListener('mousemove', () => ddActive(i));
    ddList.appendChild(li);
  });
  $('ddLabel').textContent = sel.options[sel.selectedIndex]?.text || '';
}
function ddActive(i) {
  dd.idx = i;
  [...ddList.children].forEach((li, n) => li.classList.toggle('active', n === i));
  ddList.setAttribute('aria-activedescendant', 'dd-opt-' + i);
  ddList.children[i]?.scrollIntoView({ block: 'nearest' });
}
function ddOpen() {
  ddRender();
  ddList.hidden = false;
  dd.open = true;
  ddBtn.setAttribute('aria-expanded', 'true');
  const r = ddBtn.getBoundingClientRect();
  $('dd').classList.toggle('up', innerHeight - r.bottom < ddList.offsetHeight + 24 && r.top > ddList.offsetHeight + 24);
  ddActive(sel.selectedIndex);
  ddList.focus({ preventScroll: true });
}
function ddClose(refocus = true) {
  if (!dd.open) return;
  ddList.hidden = true;
  dd.open = false;
  ddBtn.setAttribute('aria-expanded', 'false');
  if (refocus) ddBtn.focus();
}
function ddChoose(i) {
  sel.selectedIndex = i;
  ddRender();
  ddClose();
}
ddBtn.addEventListener('click', () => (dd.open ? ddClose() : ddOpen()));
ddBtn.addEventListener('keydown', e => {
  if (['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); ddOpen(); }
});
ddList.addEventListener('keydown', e => {
  const n = sel.options.length;
  if (e.key === 'ArrowDown') { e.preventDefault(); ddActive((dd.idx + 1) % n); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); ddActive((dd.idx - 1 + n) % n); }
  else if (e.key === 'Home') { e.preventDefault(); ddActive(0); }
  else if (e.key === 'End') { e.preventDefault(); ddActive(n - 1); }
  else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ddChoose(dd.idx); }
  else if (e.key === 'Escape') { e.preventDefault(); ddClose(); }
  else if (e.key === 'Tab') ddClose(false);
});
document.addEventListener('mousedown', e => { if (dd.open && !$('dd').contains(e.target)) ddClose(false); });
ddList.addEventListener('blur', () => setTimeout(() => { if (dd.open && !$('dd').contains(document.activeElement)) ddClose(false); }, 0));
new MutationObserver(ddRender).observe(sel, { childList: true });
ddRender();


/* ---------- privacy consent, personalization, notifications, inbox ---------- */
const canNotify = 'Notification' in window && 'serviceWorker' in navigator;

function openPolicy() { const d = $('privacy'); if (!d.open) d.showModal(); }
$('openPolicy').addEventListener('click', openPolicy);
$('privacy').addEventListener('close', () => {
  const v = $('privacy').returnValue;
  if (v !== 'accept' && v !== 'essential') return; // closed with Esc: ask again next time
  store.set('consent', { v: 1, accepted: v === 'accept', at: Date.now() });
  store.set('personal', v === 'accept');
  if (v !== 'accept') setNotify(false);
  toast(v === 'accept' ? 'Personalized picks on' : 'Essentials only. Change it any time in Alerts.');
  syncMeta();
  renderAlerts();
  loadForYou();
});

$('setPersonal').addEventListener('change', e => {
  if (e.target.checked && !store.get('consent', null)?.accepted) { e.target.checked = false; openPolicy(); return; }
  store.set('personal', e.target.checked);
  if (!e.target.checked) setNotify(false);
  syncMeta();
  renderAlerts();
  loadForYou();
});

async function setNotify(on) {
  if (on) {
    if (!canNotify) { toast("This browser can't show notifications."); on = false; }
    else if (!personal()) { toast('Turn on personalized suggestions first.'); on = false; }
    else {
      const p = await Notification.requestPermission();
      if (p !== 'granted') { toast('Notifications are blocked in your browser settings.'); on = false; }
    }
  }
  store.set('notify', on);
  if (on) registerPeriodic();
  syncMeta();
  renderAlerts();
}
$('setNotify').addEventListener('change', e => setNotify(e.target.checked));

$('testNotify').addEventListener('click', async () => {
  const reg = await navigator.serviceWorker?.ready;
  reg?.showNotification('Grab is all set ✦', { body: 'You will hear from us when there are fresh picks for your niche.', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url: '/#alerts' } });
});

// Chrome on Android can wake an installed app in the background to look for new picks.
async function registerPeriodic() {
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!('periodicSync' in reg)) return;
    const st = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (st.state === 'granted') await reg.periodicSync.register('gv-suggest', { minInterval: 12 * 60 * 60 * 1000 });
  } catch {}
}
// The service worker can't read localStorage, so hand it what it needs through the cache.
async function syncMeta() {
  try {
    const c = await caches.open('gv-meta');
    await c.put('/__meta', new Response(JSON.stringify({ personal: personal(), notify: store.get('notify', false), interests: personal() ? interests().slice(0, 5) : [] })));
  } catch {}
}

function renderAlerts() {
  const consent = store.get('consent', null);
  $('setPersonal').checked = personal();
  $('setNotify').checked = store.get('notify', false) && canNotify && Notification.permission === 'granted';
  $('setNotify').disabled = !canNotify;
  $('notifyNote').textContent = !canNotify ? "This browser doesn't support notifications."
    : Notification.permission === 'denied' ? 'Blocked in your browser settings. Allow notifications for this site to turn them on.'
      : 'Get a ping when there are fresh picks for your niche.';
  $('testNotify').hidden = !$('setNotify').checked;
  $('consentNote').textContent = consent ? `${consent.accepted ? 'Accepted' : 'Essentials only'} · ${new Date(consent.at).toLocaleDateString()}` : 'Not reviewed yet';

  const mine = personal() ? interests() : [];
  $('interestList').innerHTML = mine.length
    ? mine.map(k => `<span class="chip-btn interest">${esc(k)}<button type="button" data-hide="${esc(k)}" aria-label="Remove ${esc(k)}">✕</button></span>`).join('')
    : `<p class="hint">${personal() ? 'Nothing yet. Search, download or add a topic below.' : 'Turn on personalized suggestions to build your interests.'}</p>`;
  $('interestForm').hidden = !personal();

  const inbox = store.get('inbox', []);
  $('inbox').innerHTML = inbox.map(n => `
    <li class="note${n.read ? '' : ' unread'}">
      <button type="button" data-q="${esc(n.q)}"><b>${esc(n.title)}</b><span>${esc(n.body)}</span><time>${timeAgo(n.at)}</time></button>
    </li>`).join('');
  $('inboxEmpty').hidden = inbox.length > 0;
  $('markRead').hidden = !inbox.some(n => !n.read);
  updateBadge();
}
function updateBadge() {
  const n = store.get('inbox', []).filter(x => !x.read).length;
  $('alertBadge').hidden = !n;
  $('alertBadge').textContent = n > 9 ? '9+' : n;
}
$('interestList').addEventListener('click', e => {
  const b = e.target.closest('[data-hide]');
  if (!b) return;
  const k = b.dataset.hide;
  store.set('hidden', [...new Set([...store.get('hidden', []), k])]);
  store.set('manual', store.get('manual', []).filter(x => x !== k));
  syncMeta(); renderAlerts(); renderTopics();
});
$('interestForm').addEventListener('submit', e => {
  e.preventDefault();
  const k = $('interestInput').value.trim().toLowerCase();
  if (!k) return;
  store.set('manual', [...new Set([k, ...store.get('manual', [])])].slice(0, 20));
  store.set('hidden', store.get('hidden', []).filter(x => x !== k));
  $('interestInput').value = '';
  syncMeta(); renderAlerts(); renderTopics();
});
$('clearInterests').addEventListener('click', () => {
  if (!confirm('Reset suggestions? This forgets your searches and interests.')) return;
  ['searches', 'manual', 'hidden'].forEach(k => store.set(k, []));
  syncMeta(); renderTopics(); toast('Suggestions reset');
});
$('inbox').addEventListener('click', e => {
  const b = e.target.closest('[data-q]');
  if (!b) return;
  store.set('inbox', store.get('inbox', []).map(n => (n.q === b.dataset.q ? { ...n, read: true } : n)));
  updateBadge();
  showTab('home');
  $('q').value = b.dataset.q;
  runSearch(b.dataset.q);
});
$('markRead').addEventListener('click', () => { store.set('inbox', store.get('inbox', []).map(n => ({ ...n, read: true }))); renderAlerts(); });

// At most every 6 hours, turn fresh "For you" results into an inbox alert.
function maybeAlert(fy) {
  if (!fy || !personal() || !interests().length) return;
  if (Date.now() - store.get('lastAlert', 0) < 6 * 3600 * 1000) return;
  store.set('lastAlert', Date.now());
  const inbox = store.get('inbox', []);
  inbox.unshift({ id: Date.now().toString(36), q: fy.topic, title: `New picks for “${fy.topic}”`, body: fy.items[0]?.title || `${fy.items.length} fresh videos`, at: Date.now(), read: false });
  store.set('inbox', inbox.slice(0, 30));
  updateBadge();
}

/* ---------- PWA: service worker, install button, share target, start-up ---------- */
if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let installEvent = null;

function installSteps() {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return ['Tap the <b>Share</b> button in Safari.', 'Choose <b>Add to Home Screen</b>.', 'Tap <b>Add</b>.'];
  if (/android/i.test(ua)) return ['Open the browser menu <b>⋮</b>.', 'Tap <b>Install app</b> (or <b>Add to Home screen</b>).', 'Confirm.'];
  if (/safari/i.test(ua) && !/chrome|chromium|edg/i.test(ua)) return ['In the menu bar choose <b>File → Add to Dock</b>.'];
  return ['Click the <b>install icon</b> at the right end of the address bar (or the <b>⋮</b> menu → <b>Install Grab</b>).', 'Confirm.'];
}

const isApp = document.documentElement.classList.contains('is-app');

addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; });
addEventListener('appinstalled', () => { installEvent = null; $('installHelp').hidden = true; toast('Installed! Open Grab from your home screen.'); });

async function install() {
  if (installEvent) {
    installEvent.prompt();
    await installEvent.userChoice.catch(() => {});
    installEvent = null;
    return;
  }
  showTab('home');
  $('installSteps').innerHTML = installSteps().map(s => `<li>${s}</li>`).join('');
  $('installHelp').hidden = false;
  $('installHelp').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
$('install').addEventListener('click', install);
$('installCta').addEventListener('click', install);

/* ---------- website header + footer (details live in site-config.js) ---------- */
(function siteChrome() {
  const S = window.SITE || {};
  const ok = u => u && u !== '#';
  const link = (u, inner, cls = '', label = '') =>
    `<a class="${cls}" href="${ok(u) ? esc(safeUrl(u)) : '#'}"${ok(u) ? ' target="_blank" rel="noopener"' : ' data-soon'}${label ? ` aria-label="${esc(label)}"` : ''}>${inner}</a>`;

  if (ok(S.contact)) $('contact').href = safeUrl(S.contact); else $('contact').dataset.soon = '';
  $('makerName').textContent = S.name || '';
  $('makerTag').textContent = S.tagline || '';
  $('year').textContent = new Date().getFullYear();
  $('projList').innerHTML = (S.projects || []).map(p => `<li>${link(p.url, `<b>${esc(p.name)}</b><span>${esc(p.note || '')}</span>`, 'menu-item')}</li>`).join('');
  $('socialList').innerHTML = (S.socials || []).map(s =>
    `<li>${link(s.url, `<img src="/logos/${esc(s.key)}.png" alt="" width="36" height="36">`, 'soc', s.label)}</li>`).join('');

  // links without a real url yet
  document.addEventListener('click', e => { const a = e.target.closest('a[data-soon]'); if (a) { e.preventDefault(); toast('Link coming soon'); } });

  // "More projects" dropdown
  const btn = $('projBtn'), list = $('projList');
  const setOpen = open => { list.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
  btn.addEventListener('click', () => setOpen(list.hidden));
  document.addEventListener('click', e => { if (!$('projMenu').contains(e.target)) setOpen(false); });
  $('projMenu').addEventListener('keydown', e => { if (e.key === 'Escape') { setOpen(false); btn.focus(); } });
  $('footPolicy').addEventListener('click', openPolicy);
})();

(async function start() {
  const p = new URLSearchParams(location.search);
  // Share target: other apps send ?url=…&text=…&title=… ; pull the first web link out of it.
  const shared = [p.get('url'), p.get('text'), p.get('title')].filter(Boolean).join(' ').match(/https?:\/\/[^\s<>"']+/i)?.[0];
  const tab = p.get('tab') || location.hash.slice(1) || 'home';
  const q = p.get('q');
  if (location.search) history.replaceState(null, '', location.pathname + (tab !== 'home' ? '#' + tab : ''));
  showTab(shared || !isApp ? 'home' : tab, { push: false });
  if (!isApp) return; // the website only needs the link box
  updateBadge();
  syncMeta();

  if (shared) {
    $('url').value = shared;
    if ((await lookup(shared)) && settings.autoShare) startDownload(true);
  } else if (q) {
    $('q').value = q;
    runSearch(q);
  }
  // First visit: show the privacy choice once (not in the middle of a shared download).
  if (!store.get('consent', null) && !shared) setTimeout(openPolicy, 900);
  maybeAlert(await loadForYou());
})();

/* ---------- background video: pause for reduced motion ---------- */
(function bgVideo() {
  const v = document.querySelector('.bg-video');
  if (!v) return;
  const rm = matchMedia('(prefers-reduced-motion: reduce)');
  const sync = () => (rm.matches ? v.pause() : v.play().catch(() => {}));
  rm.addEventListener?.('change', sync);
  sync();
})();

/* ---------- traffic light: three logos, a random lamp swaps to a random site ---------- */
(function trafficLight() {
  // [name, file in /logos, glow colour]. Remove a line to stop advertising a site.
  const SITES = [
    ['Pinterest', 'pinterest', '#ff3b30'], ['Dribbble', 'dribbble', '#ff4d9d'], ['X', 'x', '#ffffff'], ['Instagram', 'instagram', '#ff3d8b'],
    ['TikTok', 'tiktok', '#25f4ee'], ['YouTube', 'youtube', '#ff3030'], ['Facebook', 'facebook', '#4a7bff'], ['LinkedIn', 'linkedin', '#3aa0ff'],
    ['Snapchat', 'snapchat', '#fff23a'], ['WhatsApp', 'whatsapp', '#3ddc6a'],
  ];
  const scene = $('scene');
  const lamps = [...document.querySelectorAll('#tlBox .lamp3')];
  if (!scene || !lamps.length) return;

  // scale the fixed 420x700 drawing to the window
  const fit = () => scene.style.setProperty('--s', Math.min(1, (innerHeight - 80) / 700).toFixed(3));
  addEventListener('resize', fit);
  fit();

  SITES.forEach(s => { new Image().src = `/logos/${s[1]}.png`; });
  const shown = [0, 1, 2];
  const name = $('tlName');
  const set = (i, site) => {
    shown[i] = site;
    const [label, file, glow] = SITES[site];
    lamps[i].querySelector('img').src = `/logos/${file}.png`;
    lamps[i].style.setProperty('--glow', glow);
    name.textContent = label;
    name.classList.remove('in'); void name.offsetWidth; name.classList.add('in');
  };
  shown.forEach((s, i) => set(i, s));
  name.textContent = SITES[0][0];

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const rand = n => Math.floor(Math.random() * n);
  let last = -1;
  (function tick() {
    setTimeout(() => {
      if (!document.hidden && scene.offsetParent) {
        let lamp;
        do lamp = rand(lamps.length); while (lamp === last);
        last = lamp;
        const pool = SITES.map((_, i) => i).filter(i => !shown.includes(i));
        const el = lamps[lamp];
        el.classList.remove('flip'); void el.offsetWidth; el.classList.add('flip');
        setTimeout(() => set(lamp, pool[rand(pool.length)]), 170);
      }
      tick();
    }, 1100 + Math.random() * 1200);
  })();
})();
