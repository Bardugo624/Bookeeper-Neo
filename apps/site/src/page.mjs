import { books } from './house.mjs';
import { renderPlan, renderDetail, answer, findBook } from './plan.mjs';
import { RELEASES_URL, REPO } from './downloads.mjs';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const GH = `https://github.com/${REPO}`;

const icon = {
  download: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19.5h14"/></svg>',
  arrow: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13m0 0l-5-5m5 5l-5 5"/></svg>',
  down: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v13m0 0l-5-5m5 5l5-5"/></svg>',
  sun: '<svg class="i i-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>',
  moon: '<svg class="i i-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/></svg>',
  book: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h10.5a2 2 0 0 1 2 2v15H7.5a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2zM5.5 16.5a2 2 0 0 1 2-2h11"/></svg>',
};

function shot(name, alt, cls = '', sizes = '100vw') {
  return `<picture class="shot ${cls}">
  <source srcset="/shots/${name}-dark.webp" type="image/webp" media="(prefers-color-scheme: dark)" data-theme-src="dark">
  <img src="/shots/${name}-light.webp" data-light="/shots/${name}-light.webp" data-dark="/shots/${name}-dark.webp" alt="${esc(alt)}" decoding="async" sizes="${sizes}">
</picture>`;
}

function quote(q, cls) {
  return `<figure class="quote ${cls}"><blockquote><p>${esc(q.text)}</p></blockquote><figcaption>${esc(q.author)}, <a href="${esc(q.url)}">${esc(q.work)}</a></figcaption></figure>`;
}

function schema(t) {
  return `<svg class="schema" viewBox="0 0 640 300" role="img" aria-label="${esc(`${t.schemaServer} → ${t.schemaComputer}, ${t.schemaPhone}`)}">
  <g class="s-node"><rect x="20" y="40" width="150" height="100" rx="6"/><path d="M20 120h150M70 160h50M95 140v20"/><text x="95" y="96">${esc(t.schemaComputer)}</text></g>
  <g class="s-node"><rect x="20" y="190" width="150" height="80" rx="6"/><path d="M20 222h150"/><text x="95" y="252">${esc(t.schemaComputer)}</text><circle cx="40" cy="206" r="4"/></g>
  <g class="s-node is-core"><rect x="250" y="80" width="150" height="150" rx="6"/><path d="M250 120h150M250 160h150M250 200h150"/><circle cx="380" cy="100" r="4"/><circle cx="380" cy="140" r="4"/><circle cx="380" cy="180" r="4"/><text x="325" y="256">${esc(t.schemaServer)}</text></g>
  <g class="s-node"><rect x="500" y="70" width="90" height="160" rx="16"/><path d="M530 84h30"/><circle cx="545" cy="214" r="5"/><text x="545" y="256">${esc(t.schemaPhone)}</text></g>
  <g class="s-wire"><path d="M170 90h40v60h40"/><path d="M170 230h40v-60h40"/><path d="M400 155h100"/></g>
  <text class="s-tag" x="450" y="146">${esc(t.schemaHttps)}</text>
  <g class="s-file"><path d="M300 104h50"/><path d="M300 144h50"/><path d="M300 184h50"/></g>
</svg>`;
}

export function renderPage(t, { downloadsOrder = 'index,github' } = {}) {
  const sel = findBook('promessi');
  const a = answer(sel, t.lang, t);
  const chips = books
    .map((b) => `<button type="button" class="chip" data-book="${b.id}" aria-pressed="${b.id === sel.id}">${esc(b[t.lang].title)}</button>`)
    .join('');
  const rows = t.rows
    .map(([what, does, where]) => {
      const w = where === 'both' ? t.wherBoth : where === 'phone' ? t.wherePhone : t.whereDesktop;
      return `<tr><th scope="row">${esc(what)}</th><td>${esc(does)}</td><td class="where" data-where="${where}">${esc(w)}</td></tr>`;
    })
    .join('');
  const strings = {
    lang: t.lang, locale: t.locale, labels: t.labels, short: t.short, planShelf: t.planShelf, planDoor: t.planDoor, planExample: t.planExample, dlYours: t.dlYours, dlNotesH: t.dlNotesH,
    dlFor: t.dlFor, dlGeneric: t.dlGeneric, dlVersion: t.dlVersion, dlPublished: t.dlPublished,
    dlError: t.dlError, dlErrorCta: t.dlErrorCta, dlIntelHint: t.dlIntelHint, dlDebHint: t.dlDebHint,
    themeToLight: t.themeToLight, themeToDark: t.themeToDark, footRev: t.footRev,
  };

  return `<!doctype html>
<html lang="${t.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t.title)}</title>
<meta name="description" content="${esc(t.description)}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#eef5f0" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1e332a" media="(prefers-color-scheme: dark)">
<meta name="bk-downloads" content="${esc(downloadsOrder)}">
<link rel="canonical" href="https://www.neokeeper.dev${t.selfHref}">
<link rel="alternate" hreflang="it" href="https://www.neokeeper.dev/">
<link rel="alternate" hreflang="en" href="https://www.neokeeper.dev/en/">
<link rel="alternate" hreflang="x-default" href="https://www.neokeeper.dev/">
<meta property="og:title" content="${esc(t.title)}">
<meta property="og:description" content="${esc(t.description)}">
<meta property="og:image" content="https://www.neokeeper.dev/og.png">
<meta property="og:type" content="website">
<link rel="icon" href="/icon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/icon-256.png">
<link rel="preload" href="/fonts/lora-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<script>try{var s=localStorage.getItem('bk-theme');if(s==='light'||s==='dark')document.documentElement.dataset.theme=s}catch(e){}document.documentElement.classList.add('js')</script>
<link rel="stylesheet" href="/site.css">
<script type="module" src="/js/site.js"></script>
</head>
<body>
<a class="skip" href="#main">${esc(t.skip)}</a>
<div class="sheet">
<header class="top">
  <a class="brand" href="${t.selfHref}"><img src="/icon-64.png" width="28" height="28" alt=""><span>Bookeeper</span></a>
  <nav class="nav" aria-label="${esc(t.navLabel)}">
    <a href="#app">${esc(t.navApp)}</a>
    <a href="#rete">${esc(t.navNet)}</a>
    <a href="#scarica">${esc(t.navDownload)}</a>
  </nav>
  <div class="tools">
    <a class="lang" href="${t.otherLangHref}" hreflang="${t.otherLang}" lang="${t.otherLang}">${esc(t.otherLangLabel)}</a>
    <button type="button" class="theme" aria-label="${esc(t.themeToDark)}">${icon.sun}${icon.moon}</button>
  </div>
</header>

<main id="main">
<section class="hero" aria-labelledby="h1">
  <div class="block">
    <h1 id="h1">${esc(t.h1)}</h1>
    <p class="lede">${esc(t.lede)}</p>
    <div class="get" data-state="loading">
      <a class="btn primary" id="dl-primary" href="${RELEASES_URL}">${icon.download}<span class="btn-label">${esc(t.dlGeneric)}</span></a>
      <a class="btn quiet" href="#scarica">${esc(t.dlOther)}${icon.down}</a>
      <p class="get-meta" id="dl-meta" aria-live="polite">${esc(t.dlFree)}<span class="sep" aria-hidden="true"> · </span><span class="ver">${esc(t.dlLoading)}</span></p>
      <p class="get-alt" id="dl-alt" hidden></p>
      <div class="get-phone" hidden>
        <p><strong>${esc(t.dlPhoneTitle)}.</strong> ${esc(t.dlPhoneText)}</p>
        <a class="btn quiet" href="#rete">${esc(t.dlPhoneCta)}${icon.arrow}</a>
      </div>
    </div>
    <p class="cells"><span>${esc(t.planExample)}</span><span>${esc(t.planScale)}</span><span id="rev">${esc(t.footRev)} —</span></p>
  </div>

  <figure class="drawing" id="dove" aria-labelledby="ask">
    <div class="ask" id="ask">
      <p class="ask-q"><span>${esc(t.planWhere)}</span> <em id="ask-title">${esc(a.title)}</em>?</p>
      <div class="chips" role="group" aria-label="${esc(t.planAsk)}">${chips}</div>
    </div>
    <div class="plan-wrap">
      ${renderPlan(t.lang, t, sel)}
      <p class="tag" id="tag" data-below="${a.front[1] < 260}" style="--x:${a.front[0] / 10}%;--y:${(a.front[1] / 790) * 100}%" aria-live="polite">
        <span class="tag-room">${esc(a.room)}</span><span class="tag-case">${esc(a.furniture)}</span><span class="tag-shelf">${esc(a.shelf)}</span>
      </p>
    </div>
    <figcaption class="detail">
      <span class="detail-name"><span>${esc(t.planDetail)}</span>: <b id="detail-name">${esc(a.furniture)}</b></span>
      <div class="detail-art" id="detail-art">${renderDetail(sel, t.lang, t)}</div>
    </figcaption>
  </figure>
</section>

<section class="app" id="app" aria-labelledby="app-h">
  <div class="sec-head">
    <h2 id="app-h">${esc(t.appH2)}</h2>
    <p>${esc(t.appLede)}</p>
  </div>
  <figure class="elevation-shot">
    ${shot('desktop-shelf', t.appShotAlt, 'main-shot', '(min-width: 1100px) 1040px, 100vw')}
    <ul class="notes" aria-hidden="true">
      <li class="note n2"><span>${esc(t.noteWhere)}</span></li>
      <li class="note n3"><span>${esc(t.noteSpine)}</span></li>
    </ul>
  </figure>
  <div class="figs">
    <figure>${shot('desktop-library', t.figLibraryAlt, '', '(min-width: 1100px) 33vw, 100vw')}<figcaption>${esc(t.figLibrary)}</figcaption></figure>
    <figure>${shot('desktop-book', t.figBookAlt, '', '(min-width: 1100px) 33vw, 100vw')}<figcaption>${esc(t.figBook)}</figcaption></figure>
    <figure class="phone">${shot('phone-where', t.figPhoneAlt, 'is-phone', '(min-width: 1100px) 20vw, 60vw')}<figcaption>${esc(t.figPhone)}</figcaption></figure>
  </div>
  <p class="demo-note">${esc(t.demoNote)}</p>

  <div class="schedule">
    <table>
      <caption>${esc(t.tableH2)}</caption>
      <thead><tr><th scope="col">${esc(t.colWhat)}</th><th scope="col">${esc(t.colDoes)}</th><th scope="col">${esc(t.colWhere)}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${quote(t.quoteCatalog, 'q-catalog')}
  </div>
</section>

<section class="net" id="rete" aria-labelledby="net-h">
  <div class="sec-head">
    <h2 id="net-h">${esc(t.netH2)}</h2>
    <p>${esc(t.netLede)}</p>
  </div>
  <div class="modes">
    <div class="mode">
      <h3>${esc(t.netAloneTitle)}</h3>
      <p>${esc(t.netAloneText)}</p>
    </div>
    <div class="mode is-wide">
      <h3>${esc(t.netHomeTitle)}</h3>
      <p>${esc(t.netHomeText)}</p>
      ${schema(t)}
    </div>
  </div>
  <h3 class="steps-h">${esc(t.stepsH3)}</h3>
  <ol class="steps">
    <li><h4>${esc(t.step1Title)}</h4><p>${esc(t.step1Text)}</p><pre><code>./bookeeper-server</code></pre><p class="or">${esc(t.stepCode)}</p><pre><code>docker compose up -d</code></pre></li>
    <li><h4>${esc(t.step2Title)}</h4><p>${esc(t.step2Text)}</p><pre><code>https://libri.example.org</code></pre></li>
    <li><h4>${esc(t.step3Title)}</h4><p>${esc(t.step3Text)}</p></li>
  </ol>
  <p class="guide"><a class="btn quiet" href="${GH}/blob/main/docs/deploy.md">${icon.book}${esc(t.guide)}${icon.arrow}</a></p>
  ${quote(t.quoteLend, 'q-lend')}
</section>

<section class="dl" id="scarica" aria-labelledby="dl-h">
  <div class="sec-head">
    <h2 id="dl-h">${esc(t.dlH2)}</h2>
    <p>${esc(t.dlLede)} <span id="dl-release"></span></p>
  </div>
  <div class="dl-body" data-state="loading">
    <div class="dl-tables">
      <table class="files" id="files-app">
        <caption>${esc(t.dlAppGroup)}</caption>
        <thead><tr><th scope="col">${esc(t.colSystem)}</th><th scope="col">${esc(t.colFile)}</th><th scope="col" class="num">${esc(t.colSize)}</th></tr></thead>
        <tbody><tr class="skeleton"><td colspan="3">${esc(t.dlLoading)}</td></tr></tbody>
      </table>
      <table class="files" id="files-server">
        <caption>${esc(t.dlServerGroup)}</caption>
        <thead><tr><th scope="col">${esc(t.colSystem)}</th><th scope="col">${esc(t.colFile)}</th><th scope="col" class="num">${esc(t.colSize)}</th></tr></thead>
        <tbody><tr class="skeleton"><td colspan="3">${esc(t.dlLoading)}</td></tr></tbody>
      </table>
    </div>
    <section class="notes-box" id="dl-changes" aria-labelledby="dl-changes-h" hidden>
      <h3 id="dl-changes-h">${esc(t.dlNotesH)}</h3>
      ${t.dlNotesLang ? `<p class="notes-lang">${esc(t.dlNotesLang)}</p>` : ''}
      <div class="changes" id="dl-changes-body" lang="it"></div>
    </section>
    <p class="dl-error" role="alert" hidden>${esc(t.dlError)} <a href="${RELEASES_URL}">${esc(t.dlErrorCta)}</a></p>
    <p class="dl-links"><a id="dl-notes" href="${RELEASES_URL}">${esc(t.dlNotes)}</a><a id="dl-sums" href="${RELEASES_URL}">${esc(t.dlChecksums)}</a><a href="${GH}/releases">${esc(t.dlAll)}</a></p>
  </div>
  ${quote(t.quoteGrow, 'q-grow')}
</section>
</main>

<footer class="foot">
  <a class="brand" href="${t.selfHref}"><img src="/icon-64.png" width="24" height="24" alt=""><span>${esc(t.footMade)}</span></a>
  <p class="foot-links"><a href="${GH}">${esc(t.footSource)}</a><a href="${GH}/blob/main/LICENSE">${esc(t.footLicense)}</a><a href="${GH}/blob/main/CHANGELOG.md">${esc(t.footChangelog)}</a></p>
  <p class="foot-rev" id="foot-rev"></p>
</footer>
</div>
<script type="application/json" id="bk-strings">${JSON.stringify(strings).replace(/</g, '\\u003c')}</script>
</body>
</html>
`;
}
