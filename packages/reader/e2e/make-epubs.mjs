// Writes the two books of the reader e2e test into packages/reader/e2e/books:
// a large EPUB to turn pages in, and a hostile one whose script and remote resources must stay blocked.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'books');

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// 28 November 2026, as a DOS date: the entries carry a fixed date so the output does not change between runs.
const DOS_DATE = ((2026 - 1980) << 9) | (11 << 5) | 28;

/** A ZIP whose entries are all stored, in the given order: an EPUB needs `mimetype` first and uncompressed. */
export function zip(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const body = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const crc = crc32(body);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x0800, 6);
    head.writeUInt16LE(0, 8);
    head.writeUInt16LE(0, 10);
    head.writeUInt16LE(DOS_DATE, 12);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(body.length, 18);
    head.writeUInt32LE(body.length, 22);
    head.writeUInt16LE(nameBuf.length, 26);
    head.writeUInt16LE(0, 28);
    local.push(head, nameBuf, body);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(0, 10);
    cen.writeUInt16LE(0, 12);
    cen.writeUInt16LE(DOS_DATE, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(body.length, 20);
    cen.writeUInt32LE(body.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += head.length + nameBuf.length + body.length;
  }
  const size = central.reduce((s, b) => s + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

const CONTAINER = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

const xhtml = (title, body, head = '') => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="it" xml:lang="it">
<head><meta charset="utf-8"/><title>${title}</title><link rel="stylesheet" href="style.css"/>${head}</head>
<body>${body}</body>
</html>`;

/** An EPUB 3 from `chapters` ([{ id, title, body, head? }]) and extra `files` ([{ href, type, data }]). */
export function epub({ id, title, author, chapters, files = [], css }) {
  const items = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="css" href="style.css" media-type="text/css"/>',
    ...chapters.map((c) => `<item id="${c.id}" href="${c.id}.xhtml" media-type="application/xhtml+xml"/>`),
    ...files.map((f, i) => `<item id="f${i}" href="${f.href}" media-type="${f.type}"/>`),
  ];
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id" xml:lang="it">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">${id}</dc:identifier>
    <dc:title>${title}</dc:title>
    <dc:creator>${author}</dc:creator>
    <dc:language>it</dc:language>
    <meta property="dcterms:modified">2026-11-28T00:00:00Z</meta>
  </metadata>
  <manifest>${items.join('')}</manifest>
  <spine>${chapters.map((c) => `<itemref idref="${c.id}"/>`).join('')}</spine>
</package>`;
  const nav = xhtml(
    'Indice',
    `<nav epub:type="toc"><h1>Indice</h1><ol>${chapters.map((c) => `<li><a href="${c.id}.xhtml">${c.title}</a></li>`).join('')}</ol></nav>`,
  );
  return zip([
    ['mimetype', 'application/epub+zip'],
    ['META-INF/container.xml', CONTAINER],
    ['OEBPS/content.opf', opf],
    ['OEBPS/nav.xhtml', nav],
    ['OEBPS/style.css', css],
    ...chapters.map((c) => [`OEBPS/${c.id}.xhtml`, xhtml(c.title, c.body, c.head)]),
    ...files.map((f) => [`OEBPS/${f.href}`, f.data]),
  ]);
}

/** A seeded generator, so the large book is the same on every run. */
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = (
  'la casa il libro una sera mentre lungo fiume città strada vecchio giovane madre padre lettera tempo ' +
  'pagina silenzio finestra giardino ricordo parola notte mattina inverno estate viaggio porto mare ' +
  'monte lago campagna paese piazza chiesa scuola amico amica sguardo voce mano cuore pensiero storia ' +
  'racconto scrittore lettore biblioteca scaffale volume capitolo inchiostro carta lume candela vento ' +
  'pioggia neve sole luna stella ombra luce porta scala stanza tavolo sedia ritratto specchio orologio ' +
  'aspettava tornava guardava sapeva diceva pensava scriveva leggeva camminava restava sembrava cercava ' +
  'sempre ancora appena forse quasi poi allora intanto dunque però anzi oltre dentro fuori sopra sotto ' +
  'lento chiaro scuro lontano vicino antico nuovo piccolo grande lieve stanco attento sereno inquieto'
).split(' ');

function sentence(next) {
  const n = 8 + Math.floor(next() * 14);
  const words = Array.from({ length: n }, () => WORDS[Math.floor(next() * WORDS.length)]);
  if (next() < 0.25) words[Math.floor(next() * n)] = `<em>${words[0]}</em>`;
  const text = words.join(' ').replace(/^./, (c) => c.toUpperCase());
  return text + (next() < 0.12 ? ';' : next() < 0.1 ? '?' : '.');
}

const paragraph = (next) => `<p>${Array.from({ length: 3 + Math.floor(next() * 5) }, () => sentence(next)).join(' ')}</p>`;

const SVG = (n) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="600" height="400" fill="#e9e2d0"/><circle cx="${150 + n * 7}" cy="200" r="120" fill="#5b7a62"/><text x="300" y="380" font-size="28" text-anchor="middle" fill="#2b2b2b">Tavola ${n}</text></svg>`;

const BOOK_CSS = `body { font-family: serif; line-height: 1.5; margin: 0 1em; }
h2 { margin: 2em 0 1em; text-align: center; font-weight: normal; letter-spacing: 0.05em; }
p { margin: 0; text-indent: 1.5em; text-align: justify; hyphens: auto; }
h2 + p { text-indent: 0; }
blockquote { margin: 1em 2em; font-style: italic; }
table { border-collapse: collapse; margin: 1em auto; }
td, th { border: 1px solid #999; padding: 0.2em 0.6em; }
figure { margin: 1em 0; text-align: center; }
img { max-width: 100%; }
aside { font-size: 0.85em; margin-top: 1em; }`;

/** About 1 million characters in 200 chapters, with the elements a novel or an essay uses. */
export function largeBook() {
  const next = random(10);
  const files = [];
  const chapters = Array.from({ length: 200 }, (_, i) => {
    const n = i + 1;
    const parts = [`<h2>Capitolo ${n}</h2>`];
    for (let p = 0; p < 22; p++) {
      parts.push(paragraph(next));
      if (p === 6 && n % 3 === 0) parts.push(`<blockquote><p>${sentence(next)} ${sentence(next)}</p></blockquote>`);
      if (p === 9 && n % 4 === 0) parts.push(`<p>${sentence(next)}<a epub:type="noteref" href="#nota${n}">${n}</a></p>`);
      if (p === 12 && n % 20 === 0) {
        const rows = Array.from({ length: 5 }, (_, r) => `<tr><td>${WORDS[r + n % 50]}</td><td>${1800 + n + r}</td></tr>`).join('');
        parts.push(`<table><tr><th>Voce</th><th>Anno</th></tr>${rows}</table>`);
      }
      if (p === 15 && n % 25 === 0) {
        files.push({ href: `tavola${n}.svg`, type: 'image/svg+xml', data: SVG(n) });
        parts.push(`<figure><img src="tavola${n}.svg" alt="Tavola ${n}"/></figure>`);
      }
    }
    if (n % 4 === 0) parts.push(`<aside epub:type="footnote" id="nota${n}"><p>${n}. ${sentence(next)}</p></aside>`);
    return { id: `c${String(n).padStart(3, '0')}`, title: `Capitolo ${n}`, body: parts.join('\n') };
  });
  return epub({ id: 'urn:bookeeper:prova:grande', title: 'Il libro grande', author: 'Bookeeper', chapters, files, css: BOOK_CSS });
}

/** A book that tries to run script, load remote resources and frame a remote page: all must stay blocked. */
export function hostileBook() {
  const body = `<h2>Capitolo ostile</h2>
<p onclick="window.top.__bkScriptRan = 'onclick'">Questo capitolo prova a eseguire codice e a caricare risorse da fuori.</p>
<script>window.top.__bkScriptRan = 'script';</script>
<img src="https://example.invalid/pixel.png" alt=""/>
<iframe src="https://example.invalid/pagina"></iframe>
<p>Se la prova passa, niente di tutto questo è stato eseguito o caricato.</p>`;
  const head = '<link rel="stylesheet" href="https://example.invalid/stile.css"/><script>window.top.__bkScriptRan = \'head\';</script>';
  return epub({
    id: 'urn:bookeeper:prova:ostile',
    title: 'Il libro ostile',
    author: 'Bookeeper',
    chapters: [{ id: 'c001', title: 'Capitolo ostile', body: `<div onmouseover="window.top.__bkScriptRan = 'mouseover'">${body}</div>`, head }],
    css: 'body { font-family: serif; } body { background-image: url("https://example.invalid/sfondo.png"); }',
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'grande.epub'), largeBook());
  writeFileSync(join(OUT, 'ostile.epub'), hostileBook());
}
