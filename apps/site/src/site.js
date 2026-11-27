import { loadRelease, detectSystem, formatSize, RELEASES_URL } from './downloads.mjs';
import { renderPlan, renderDetail, answer, findBook } from './plan.mjs';

const T = JSON.parse(document.getElementById('bk-strings').textContent);
const $ = (s, r = document) => r.querySelector(s);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

/* Theme: system by default, a manual choice wins and is remembered when storage allows. */
const root = document.documentElement;
const systemDark = matchMedia('(prefers-color-scheme: dark)');
const currentTheme = () => root.dataset.theme || (systemDark.matches ? 'dark' : 'light');
function syncTheme() {
  const dark = currentTheme() === 'dark';
  const btn = $('.theme');
  btn.setAttribute('aria-label', dark ? T.themeToLight : T.themeToDark);
  btn.dataset.mode = dark ? 'dark' : 'light';
  for (const img of document.querySelectorAll('img[data-light]')) {
    const src = dark ? img.dataset.dark : img.dataset.light;
    const source = img.parentElement.querySelector('source[data-theme-src]');
    if (source) source.remove();
    if (img.getAttribute('src') !== src) img.src = src;
  }
}
$('.theme').addEventListener('click', () => {
  root.dataset.theme = currentTheme() === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem('bk-theme', root.dataset.theme); } catch { /* private mode */ }
  syncTheme();
});
systemDark.addEventListener('change', syncTheme);
if (root.dataset.theme) syncTheme();
else $('.theme').setAttribute('aria-label', systemDark.matches ? T.themeToLight : T.themeToDark);

/* Where is it: the plan answers for the chosen title. */
const planWrap = $('.plan-wrap');
const tag = $('#tag');
function show(id, animate) {
  const book = findBook(id);
  const a = answer(book, T.lang, T);
  const old = $('svg.plan', planWrap);
  old.outerHTML = renderPlan(T.lang, T, book);
  $('#ask-title').textContent = a.title;
  tag.style.setProperty('--x', `${a.front[0] / 10}%`);
  tag.style.setProperty('--y', `${(a.front[1] / 790) * 100}%`);
  tag.dataset.below = String(a.front[1] < 260);
  tag.innerHTML = '';
  for (const [cls, text] of [['tag-room', a.room], ['tag-case', a.furniture], ['tag-shelf', a.shelf]]) {
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = text;
    tag.append(s);
  }
  $('#detail-name').textContent = a.furniture;
  $('#detail-art').innerHTML = renderDetail(book, T.lang, T);
  for (const c of document.querySelectorAll('.chip')) c.setAttribute('aria-pressed', String(c.dataset.book === id));
  if (animate && !reduced.matches) draw();
}
function draw() {
  const route = $('svg.plan .route');
  const len = route.getTotalLength();
  route.style.setProperty('--len', len);
  planWrap.classList.remove('is-drawing');
  void planWrap.offsetWidth;
  planWrap.classList.add('is-drawing');
}
for (const chip of document.querySelectorAll('.chip')) {
  chip.addEventListener('click', () => show(chip.dataset.book, true));
}
// The first answer draws itself once the plan is on screen.
const io = new IntersectionObserver((entries) => {
  if (entries.some((e) => e.isIntersecting)) {
    io.disconnect();
    if (!reduced.matches) draw();
  }
}, { threshold: 0.4 });
io.observe(planWrap);

/* Downloads: the right installer first, every version read from the release. */
const order = ($('meta[name="bk-downloads"]')?.content || 'github').split(',').map((s) => s.trim());
const sys = detectSystem(navigator.userAgent, null);
const fmtDate = (d) => (d ? new Intl.DateTimeFormat(T.locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d)) : '');

async function hints() {
  try {
    if (navigator.userAgentData?.getHighEntropyValues) {
      return await navigator.userAgentData.getHighEntropyValues(['architecture', 'platform']);
    }
  } catch { /* not offered */ }
  return null;
}

function link(file, text, cls = '') {
  const a = document.createElement('a');
  a.href = file.url;
  a.textContent = text;
  if (cls) a.className = cls;
  return a;
}

function fillTable(table, files) {
  const body = table.tBodies[0];
  body.innerHTML = '';
  for (const f of files) {
    const tr = document.createElement('tr');
    if (f.id === system.primary) tr.className = 'is-yours';
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = T.labels[f.id];
    if (f.id === system.primary) {
      const mark = document.createElement('span');
      mark.className = 'yours';
      mark.textContent = T.dlYours;
      th.append(mark);
    }
    const td = document.createElement('td');
    td.append(link(f, f.name, 'file'));
    const size = document.createElement('td');
    size.className = 'num';
    size.textContent = formatSize(f.size, T.lang);
    tr.append(th, td, size);
    body.append(tr);
  }
}

let system = sys;
(async () => {
  const h = await hints();
  system = detectSystem(navigator.userAgent, h);
  const get = $('.get');
  if (system.kind === 'phone') {
    $('.get-phone').hidden = false;
    get.classList.add('is-phone');
  }
  try {
    const rel = await loadRelease(order);
    const byId = Object.fromEntries(rel.files.map((f) => [f.id, f]));
    const primary = byId[system.primary];
    const btn = $('#dl-primary');
    if (primary) {
      btn.href = primary.url;
      $('.btn-label', btn).textContent = `${T.dlFor} ${T.short[primary.id]}`;
      const alt = byId[system.secondary];
      if (alt) {
        const p = $('#dl-alt');
        p.hidden = false;
        p.textContent = `${system.kind === 'mac' ? T.dlIntelHint : T.dlDebHint} `;
        p.append(link(alt, alt.name));
      }
    } else {
      btn.href = '#scarica';
    }
    const ver = $('#dl-meta .ver');
    ver.textContent = `${T.dlVersion} ${rel.version}${primary ? ` · ${formatSize(primary.size, T.lang)}` : ''}`;
    $('#rev').textContent = `${T.footRev} ${rel.version}`;
    $('#foot-rev').textContent = `${T.dlVersion} ${rel.version}${rel.date ? `, ${T.dlPublished} ${fmtDate(rel.date)}` : ''}`;
    $('#dl-release').textContent = `${T.dlVersion} ${rel.version}${rel.date ? `, ${T.dlPublished} ${fmtDate(rel.date)}.` : '.'}`;
    fillTable($('#files-app'), rel.files.filter((f) => !f.id.startsWith('server') && f.id !== 'checksums'));
    fillTable($('#files-server'), rel.files.filter((f) => f.id.startsWith('server')));
    if (byId.checksums) $('#dl-sums').href = byId.checksums.url;
    $('#dl-notes').href = rel.notesUrl;
    get.dataset.state = 'ready';
    $('.dl-body').dataset.state = 'ready';
  } catch {
    get.dataset.state = 'error';
    $('#dl-meta .ver').textContent = '';
    $('#dl-meta .sep').hidden = true;
    $('#dl-primary').href = RELEASES_URL;
    $('.dl-body').dataset.state = 'error';
    $('.dl-error').hidden = false;
    for (const t of document.querySelectorAll('.files')) t.hidden = true;
  }
})();

