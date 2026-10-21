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

$('form').addEventListener('submit', async e => {
  e.preventDefault();
  const url = $('url').value.trim();
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
  } catch (err) {
    showError(err.message);
  } finally {
    $('go').disabled = false;
    $('go').textContent = '+';
  }
});

// Hosted mode: the server only resolves the media URL, the browser fetches the file itself.
async function directDownload(opt, title) {
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
    // The host doesn't allow in-page downloads; open the file so it can be saved from the browser.
    window.open(opt.url, '_blank', 'noopener');
    showError('Your browser opened the video in a new tab. Right-click it (or use the ⋮ menu) and choose "Save video as".');
  }
}

$('dl').addEventListener('click', async e => {
  e.preventDefault();
  if (!current) return;
  const btn = $('dl');
  btn.classList.add('busy');
  btn.textContent = 'Preparing…';
  $('note').hidden = false;
  showError('');
  try {
    if (current.options) {
      await directDownload(current.options[Number($('quality').value)], current.title);
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
});

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
