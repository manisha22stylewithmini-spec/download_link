const $ = id => document.getElementById(id);
let current = null;

function showError(msg) { $('error').textContent = msg; $('error').hidden = !msg; }

function fmtDuration(s) {
  if (!s) return '';
  const m = Math.floor(s / 60), sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

$('paste').addEventListener('click', async () => {
  try { $('url').value = (await navigator.clipboard.readText()).trim(); $('url').focus(); }
  catch { $('url').focus(); }
});
$('clear').addEventListener('click', () => { $('url').value = ''; $('result').hidden = true; showError(''); $('url').focus(); });

$('form').addEventListener('submit', e => {
  e.preventDefault();
  lookup($('url').value.trim());
});

async function lookup(url) {
  showError('');
  $('result').hidden = true;
  $('go').disabled = true;
  $('go').textContent = '…';
  try {
    const r = await fetch('/api/info?url=' + encodeURIComponent(url));
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Something went wrong.');
    current = { url, ...data };
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
    $('result').hidden = false;
    return true;
  } catch (err) {
    showError(err.message);
    return false;
  } finally {
    $('go').disabled = false;
    $('go').textContent = '+';
  }
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
  btn.classList.add('busy');
  btn.textContent = 'Preparing…';
  $('note').hidden = false;
  showError('');
  try {
    if (current.options) {
      await directDownload(current.options[Number($('quality').value)], current.title, auto);
      return;
    }
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
  } catch (err) {
    showError(err.message);
  } finally {
    btn.classList.remove('busy');
    btn.textContent = 'Download';
    $('note').hidden = true;
  }
}

function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  $('theme').setAttribute('aria-label', t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  try { localStorage.setItem('theme', t); } catch {}
}
$('theme').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
applyTheme(document.documentElement.dataset.theme || 'light');

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

/* ---------- PWA: service worker, install button, share target ---------- */
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
  return ['Click the <b>install icon</b> at the right end of the address bar (or the <b>⋮</b> menu → <b>Install Grab Video</b>).', 'Confirm.'];
}

if (!standalone) $('install').hidden = false;

addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; });
addEventListener('appinstalled', () => { installEvent = null; $('install').hidden = true; $('installHelp').hidden = true; });

$('install').addEventListener('click', async () => {
  if (installEvent) {
    installEvent.prompt();
    await installEvent.userChoice.catch(() => {});
    installEvent = null;
    return;
  }
  $('installSteps').innerHTML = installSteps().map(s => `<li>${s}</li>`).join('');
  $('installHelp').hidden = !$('installHelp').hidden;
  if (!$('installHelp').hidden) $('installHelp').scrollIntoView({ behavior: 'smooth', block: 'center' });
});

// Share target: other apps send ?url=…&text=…&title=… ; pull the first web link out of it and download straight away.
(async function handleShare() {
  const p = new URLSearchParams(location.search);
  const blob = [p.get('url'), p.get('text'), p.get('title')].filter(Boolean).join(' ');
  const link = blob.match(/https?:\/\/[^\s<>"']+/i)?.[0];
  if (!link) return;
  history.replaceState(null, '', location.pathname);
  $('url').value = link;
  if (await lookup(link)) startDownload(true);
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

  // scale the fixed 440x760 drawing to the window
  const fit = () => scene.style.setProperty('--s', Math.min(1, (innerHeight - 80) / 760).toFixed(3));
  addEventListener('resize', fit);
  fit();

  // original pixel art for the yellow sign panels
  const PAL = { r: '#ff5d8f', o: '#ffb000', k: '#1b1b1b', p: '#ff8fb8', g: '#47c23a', G: '#2a8a2a', w: '#ffffff' };
  const pixel = (id, rows) => {
    const svg = $(id), h = rows.length, w = rows[0].length;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.innerHTML = rows.flatMap((row, y) => [...row].map((ch, x) => (PAL[ch] ? `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${PAL[ch]}"/>` : ''))).join('');
  };
  pixel('pxFlower', [
    '....rrrrrr....',
    '..rrrrrrrrrr..',
    '.rrroooooorrr.',
    '.rroooooooorr.',
    'rrookooookoorr',
    'rrookooookoorr',
    'rropooooooporr',
    'rrooookkooooor',
    '.rroooooooorr.',
    '.rrroooooorrr.',
    '..rrrrrrrrrr..',
    '....rrgrrr....',
    '.gg...g...gg..',
    '.ggg..g..ggg..',
    '..GGG.g.GGG...',
    '......G.......',
  ]);
  pixel('pxArrow', [
    '....kkkk....',
    '....kppk....',
    '....kppk....',
    '....kppk....',
    '.kkkkppkkkk.',
    '..kppppppk..',
    '...kppppk...',
    '....kppk....',
    '.....kk.....',
    '............',
    'k..........k',
    'kkkkkkkkkkkk',
  ]);

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
