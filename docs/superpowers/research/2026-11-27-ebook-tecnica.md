# Bookeeper e-book reader: technical building blocks

Research date: 2026-11-27. Evidence rule: every claim carries a URL. Claims marked **[unverified]** come from general knowledge or a single weak source and must be tested before relying on them. GitHub API access was blocked in this session, so repo stats (stars, open issues) come from page fetches and may be stale; package versions and dates come directly from the npm and crates.io registries.

---

## 0. Executive summary

* Two credible engines exist for "WebView + mobile PWA": **foliate-js** (MIT; EPUB, MOBI/AZW3, FB2, CBZ, PDF via pdf.js; no build step, "not stable") and the **Readium ts-toolkit navigator** (BSD-3; very active; EPUB reflowable + FXL, comics/Divina, audio, read-aloud; needs a Readium Web Publication Manifest). epub.js is effectively unmaintained (last npm release 2022-02) and should be excluded.
* foliate-js is the only one that parses MOBI/AZW3/FB2 in the browser and is the engine in a shipping Tauri v2 app (Readest) and in a WebKitGTK desktop app (Foliate). Readium has the better architecture for position model (Locator), annotations (decorator), and active maintenance, but is EPUB/comic/audio only (no MOBI/FB2/PDF navigator found in the 2.17 package).
* Neither engine makes untrusted EPUB safe on its own. foliate-js tells you to impose your own CSP. Readium injects a restrictive CSP meta tag but still allows scripts from allowed domains plus `'unsafe-inline'`. Plan: serve book resources from a separate origin or sandboxed context and enforce a strict CSP in the host.
* Interop: KOReader's kosync is a tiny, well-specified protocol (4 endpoints that matter) with a partial-MD5 document hash; OPDS 1.2 gives the broadest reader coverage, OPDS 2.0 is JSON and shares the Readium manifest model. Cross-app EPUB position is lossy by design (KOReader sends an xpointer plus percentage; Komga keeps only chapter starts).
* Rust: `epub` crate is **GPL-3.0-or-later** (check license compatibility); `rbook` is Apache-2.0 and active; MOBI crate is stale (2022); PDF: `lopdf` (MIT) for metadata, `pdfium-render` (MIT/Apache) for cover render, `mupdf` is AGPL.

---

## 1. Rendering engines

### 1.1 Comparison table

| | foliate-js | Readium ts-toolkit (`@readium/navigator`) | epub.js | pdf.js |
|---|---|---|---|---|
| License | MIT; vendored zip.js BSD-3, fflate MIT, PDF.js Apache ([README](https://github.com/johnfactotum/foliate-js)) | BSD-3-Clause ([npm](https://registry.npmjs.org/@readium/navigator)) | BSD (2-clause per npm for 0.3.x) ([npm](https://registry.npmjs.org/epubjs)) | Apache-2.0 ([repo](https://github.com/mozilla/pdf.js)) |
| Maintenance | Last commit seen 2026-05-01; commits through 2026 (PDF.js bump to 5.5.207 in Mar 2026, TTS fixes Apr 2026) ([commits](https://github.com/johnfactotum/foliate-js/commits/main)). 42 open issues / 32 open PRs ([repo](https://github.com/johnfactotum/foliate-js)). **No releases, no npm release of the lib proper**; README recommends a git submodule and says the API "may break at any time" ([README](https://github.com/johnfactotum/foliate-js)) | Very active: navigator 2.17.0 published 2026-11-25, 2.16.0 on 2026-11-20, 2.15.0 on 2026-11-06 ([npm](https://registry.npmjs.org/@readium/navigator)); shared 2.9.0 (2026-11-06); injectables 2.11.1 (2026-11-24) ([npm](https://registry.npmjs.org/@readium/navigator-html-injectables)). Minor versions may contain breaking changes; pin with `~` ([README](https://raw.githubusercontent.com/readium/ts-toolkit/develop/README.md)). Repo: ~60 open issues ([repo](https://github.com/readium/ts-toolkit)) | **Stale**: latest npm 0.3.93 published 2022-02-16 ([npm](https://registry.npmjs.org/epubjs)); 486 open issues, 33 open PRs ([repo](https://github.com/futurepress/epub.js)) | Very active: 6.5.438 on 2026-11-01, monthly releases ([npm](https://registry.npmjs.org/pdfjs-dist)); 382 open issues ([repo](https://github.com/mozilla/pdf.js)) |
| Formats | EPUB, MOBI, KF8/AZW3, FB2, CBZ, PDF (experimental, via PDF.js). Not CBR, no TXT natively ([README](https://github.com/johnfactotum/foliate-js)). Readest adds TXT/HTML/Markdown on top ([Readest](https://github.com/readest/readest)) | EPUB reflowable and fixed layout per EDRLab ([Readium Web](https://www.edrlab.org/software/readium-web/)); the 2.17 package also ships `divina` (comics), `audio`, `readaloud`, `webpub` navigators (inspected package contents of `@readium/navigator@2.17.0`; EDRLab's page still lists comics as "planned"). No PDF navigator found in the package. No MOBI/FB2 (needs conversion) | EPUB only ([repo](https://github.com/futurepress/epub.js)) | PDF only |
| Pagination / scroll | CSS multi-column paginator; paged and scrolled switchable without reload; **no continuous scroll across sections**; "some CSS styles don't behave as expected" ([README](https://github.com/johnfactotum/foliate-js)) | Paginated and scroll modes; Readium CSS integration ([README](https://raw.githubusercontent.com/readium/ts-toolkit/develop/navigator/README.MD) via package) | `default` (one section) or `continuous` render; flows paginated/scrolled ([repo](https://github.com/futurepress/epub.js)) | Page-based canvas rendering |
| Two-page spreads | Fixed-layout renderer handles spreads; no mixed-layout books ([README](https://github.com/johnfactotum/foliate-js)) | FXL spreader in the package (`FXLSpreader.ts`, inspected) | "spreads" example ([repo](https://github.com/futurepress/epub.js)) | Spread modes in the stock viewer |
| Isolation | One iframe per section loaded from `blob:` URLs (same origin as host); scripted content "not supported", **iframe sandbox is useless because of WebKit bug 218086 forcing `allow-scripts`**; you must apply a CSP blocking scripts except `'self'` ([README Security](https://github.com/johnfactotum/foliate-js)) | iframes with `sandbox="allow-same-origin allow-scripts"` and an injected CSP `<meta>`: `default-src <allowed> blob:`, `connect-src 'none'`, `form-action 'none'`, but `script-src <allowed> blob: 'unsafe-inline'` (inspected `FrameBlobBuilder.ts` and compiled `FrameManager.js` in `@readium/navigator@2.17.0`) | Scripts off by default; opt-in `allowScriptedContent` ([repo](https://github.com/futurepress/epub.js)) | Worker-based; runs with page permissions ([FAQ](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions)) |
| Position model | **EPUB CFI** (own parser, supports text assertions; spatial/temporal offsets not used in rendering) plus fraction/progress helpers ([README](https://github.com/johnfactotum/foliate-js)) | **Readium Locator**: `href`, `type`, `locations{progression, position, totalProgression, fragments, cssSelector, ...}`, `text{before, highlight, after}` ([spec](https://readium.org/architecture/models/locators/)) | EPUB CFI ([repo](https://github.com/futurepress/epub.js)) | page number |
| Search | `search.js` using `Intl.Collator`/`Intl.Segmenter`, diacritic-insensitive, whole-word; author calls it "extremely slow", advises incremental loading ([README](https://github.com/johnfactotum/foliate-js)); fix for search-match drawing Apr 2026 ([commits](https://github.com/johnfactotum/foliate-js/commits/main)) | Find-in-publication is **[unverified]** in 2.17; the package depends on `@readium/helpers` and `@readium/guided-navigation` ([package.json of navigator 2.17.0, inspected]) | Basic text search | Built in (`pdf_find_controller`) |
| Annotations | `overlayer.js`: arbitrary SVG overlays with hit-testing, no built-in event listeners ([README](https://github.com/johnfactotum/foliate-js)) | `@readium/decorator` dependency (decorations/highlights) ([package.json, inspected]); Locator `text` supports highlights ([spec](https://readium.org/architecture/models/locators/)) | Annotations/highlights example ([repo](https://github.com/futurepress/epub.js)) | Annotation layers |
| TTS | Emits SSML for your synthesizer; does not speak ([README](https://github.com/johnfactotum/foliate-js)); TTS fixes in Apr 2026 | `@readium/speech` (0.24.0 on npm) and a `readaloud` navigator in the package ([npm](https://registry.npmjs.org/@readium/speech), inspected package) | none | none |
| Accessibility | Relies on EPUB content semantics; no dedicated claims found **[unverified]** | EDRLab positions Thorium Web as "accessible design" ([Thorium Web README](https://cdn.jsdelivr.net/npm/@edrlab/thorium-web@1.5.5/README.md)); Readium CSS provides user-setting overrides | n/a | Text layer, tagged PDF support in stock viewer **[unverified]** |
| Size | No build; ES modules, small ("Small and modular", "No hard dependencies") ([README](https://github.com/johnfactotum/foliate-js)); PDF.js is an optional extra | Navigator 2.17.0 tarball unpacked ~2.8 MB (all dist + src + types; measured by `npm pack`); runtime bundle smaller **[not measured]** | ~ (unpacked size not measured) | `pdf.min.mjs` 474 kB (136 kB gzip) + worker 1.27 MB (379 kB gzip) for 6.5.438; legacy build 538 kB + 1.33 MB (measured via [jsDelivr](https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/build/pdf.min.mjs)) |
| WebKit / iOS | Foliate (GTK) runs foliate-js inside **WebKitGTK** ([Foliate README](https://raw.githubusercontent.com/johnfactotum/foliate/gtk4/README.md)); Readest runs it in Tauri v2 on macOS/iOS/Windows/Android ([Readest](https://github.com/readest/readest)) | Tested "in Chrome, Firefox, Edge, and Safari" ([Readium Web](https://www.edrlab.org/software/readium-web/)); Thorium Web known issues: fullscreen unavailable on iOS, iPadOS desktop-mode font-size intervention ([README](https://cdn.jsdelivr.net/npm/@edrlab/thorium-web@1.5.5/README.md)) | old; WebKit issues likely **[unverified]** | Official support: modern build Firefox+Chrome only; legacy build "Safari 18+ mostly" ([FAQ](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions)). Node >=22.13 required to build ([package.json](https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/package.json)) |
| Real users | Foliate (GTK, GPL-3), Readest (AGPL-3, Tauri v2 + Next.js; bundles foliate-js, zip.js, fflate, PDF.js) ([Readest](https://github.com/readest/readest)) | Thorium Web (EDRLab reference app, Next.js, `@edrlab/thorium-web` 1.7.0 on 2026-10-07 per [npm](https://registry.npmjs.org/@edrlab/thorium-web)); a production reader at De Marque ([Readium Web](https://www.edrlab.org/software/readium-web/)). Thorium Reader (desktop) is Electron on the older r2-navigator-js **[unverified: not fetched]** | Many legacy apps | Firefox, many |

### 1.2 WebKit-specific findings
* WebKit bug 218086 forces `allow-scripts` on iframes, defeating sandbox ([foliate-js README](https://github.com/johnfactotum/foliate-js)).
* A WebKit bug from 2026 reports that books with `column-count: 1` break, tied to a regression in multicol nested fragmentation; marked fixed, Safari version containing the fix not stated ([WebKit bug 316008 appeared in search; verify](https://bugs.webkit.org/show_bug.cgi?id=316008)) **[unverified match]**. Relevant because both foliate-js and epub.js use CSS multi-column pagination. Treat as a regression-test item for every iOS/WebKitGTK release.
* IDPF font deobfuscation needs SHA-1 via Web Crypto, which is only available in secure contexts; an HTTP LAN deployment needs a JS SHA-1 fallback ([foliate-js README](https://github.com/johnfactotum/foliate-js)). Important for a self-hosted server on plain HTTP, and for the PWA (service workers also require HTTPS).
* Readest on Windows fails to start without a working WebView2 runtime ([Readest README](https://github.com/readest/readest)); Linux builds need an X11/XWayland backend (same page). Not directly a foliate-js issue, but shows Tauri WebView variance.

### 1.3 Other candidates examined
* **Forks of foliate-js** exist (e.g. [ismaelcompsci/foliate-js](https://github.com/ismaelcompsci/foliate-js)); not evaluated for quality.
* **Vivliostyle, Bibi, Koodo Reader engine**: not researched in depth. My search returned no usable source for them; Vivliostyle and Koodo licensing (reported AGPL) is **[unverified]**.
* **pdf.js** is only a PDF layer and is already what foliate-js and Readest use.
* **Komga's EPUB web reader** exists but its engine is not documented in the sources I could read ([Komga EPUB reader](https://komga.org/docs/guides/webreader-epub)); the initial 1.8.0 release did not save progress ([blog](https://komga.org/blog/ebook-support)).

---

## 2. Rust-side metadata and covers

| Crate | Version / date | License | Notes |
|---|---|---|---|
| `epub` | 2.1.6, 2026-11-01 ([crates.io](https://crates.io/crates/epub)) | **GPL-3.0-or-later** (crates.io API) | Reads EPUB; actively maintained, MSRV 1.88 ([README](https://raw.githubusercontent.com/danigm/epub-rs/master/README.md)). The license may be a blocker for a non-GPL app. |
| `rbook` | 0.7.13, 2026-11-13 ([crates.io](https://crates.io/crates/rbook)) | Apache-2.0 | EPUB 2 and 3 parse and write, typed metadata, manifest, spine, ToC, lazy resource retrieval, wasm32 target; MOBI/AZW3 "upcoming" ([README](https://raw.githubusercontent.com/DevinSterling/rbook/master/README.md)). Best fit. |
| `epub-parser` | 0.3.4, 2026-02-07 | MIT | Extracts metadata, ToC, text, covers ([crates.io search](https://crates.io/api/v1/crates?q=epub&per_page=10&sort=downloads)) |
| `mobi` | 0.8.0, **2022-12-11** | MIT | MOBI only, stale ([repo](https://github.com/vv9k/mobi-rs)). AZW3/KF8 support not confirmed. |
| `zip` | 9.8.2, 2026-11-23 | MIT | For raw container access and cover extraction. |
| `lopdf` | 0.47.0, 2026-11-04 | MIT | PDF object model, Info dict / XMP read ([crates.io](https://crates.io/crates/lopdf)) |
| `pdfium-render` | 0.9.6, 2026-11-21 | MIT OR Apache-2.0 | Renders page 1 as cover but needs the PDFium binary ([crates.io](https://crates.io/crates/pdfium-render)) |
| `mupdf` | 0.8.0 | **AGPL-3.0** | Avoid unless the project is AGPL ([crates.io](https://crates.io/crates/mupdf)) |
| `infer` / `file-format` | 0.22.0 / 0.29.0 | MIT | Magic-number sniffing ([crates.io search](https://crates.io/api/v1/crates?q=epub&per_page=10&sort=downloads)) |

How others do it:
* **Kavita**, EPUB: reads OPF only: `dc:title`, `calibre:series`, `calibre:series_index`, `dc:subject`, `dc:language`, ISBN identifier; ComicInfo.xml applies to archives (CBZ) and overrides filename parsing ([Kavita wiki: epub](https://wiki.kavitareader.com/guides/metadata/epubs/), [general](https://wiki.kavitareader.com/guides/metadata/general/)). PDFs: limited XMP `<x:xmpmeta>` metadata ([Kavita wiki: pdf](https://wiki.kavitareader.com/guides/metadata/pdfs/)).
* **Calibre** `ebook-meta` reads azw, azw3, cbz/cbr/cb7, epub, mobi, opf, pdf and extracts covers with `--get-cover`; writing is uneven across formats ([man page](https://man.archlinux.org/man/ebook-meta.1.en)). Calibre is a Python/GPL tool; it is a possible optional external helper for MOBI/AZW3 but not an embeddable Rust component.
* For MOBI/AZW3 metadata in pure Rust there is no maintained crate I could verify. Options: the stale `mobi` crate, parse EXTH records yourself, or defer to foliate-js (which parses MOBI/KF8 in JS, [README](https://github.com/johnfactotum/foliate-js)) and report metadata back to the server on first open.

---

## 3. Sync and interoperability

### 3.1 KOReader sync (kosync)
* Reference server: `koreader/koreader-sync-server` (Lua/OpenResty, AGPL-3) ([README](https://raw.githubusercontent.com/koreader/koreader-sync-server/master/README.md)). No official spec; the third-party observational spec with CC0 text and a verifier is [pid1/kosync-conformance](https://github.com/pid1/kosync-conformance) (spec: [SPEC.md](https://raw.githubusercontent.com/pid1/kosync-conformance/main/SPEC.md)).
* Endpoints: `GET /healthcheck`, `POST /users/create`, `GET /users/auth`, `PUT /syncs/progress`, `GET /syncs/progress/:document`, plus `PUT /users/password` (server only) ([SPEC.md](https://raw.githubusercontent.com/pid1/kosync-conformance/main/SPEC.md)).
* Auth: headers `x-auth-user` and `x-auth-key`; the key is the lowercase hex **MD5 of the password**, and `password` in `POST /users/create` is already that MD5, so the server must not hash again ([SPEC.md](https://raw.githubusercontent.com/pid1/kosync-conformance/main/SPEC.md), [conformance README](https://raw.githubusercontent.com/pid1/kosync-conformance/main/README.md)). Client request `Accept: application/vnd.koreader.v1+json` ([KOSyncClient.lua](https://raw.githubusercontent.com/koreader/koreader/master/plugins/kosync.koplugin/KOSyncClient.lua)).
* Payload: `{document, progress, percentage (0..1), device, device_id}`; server returns `{document, timestamp}` with server-generated timestamp; last write wins; `progress` for an EPUB is a crengine xpointer such as `/body/DocFragment[11]/body/div/p[7]/text().123` ([SPEC.md](https://raw.githubusercontent.com/pid1/kosync-conformance/main/SPEC.md)). It is not a CFI, so exact mid-chapter mapping to foliate-js/Readium is not available; use `percentage` or chapter index.
* Gotchas from the conformance study: unknown document must return `200 {}` not 404; non-401 errors make the client retry for four weeks; omitting `timestamp` on GET changes sync policy; a reference-server bug stores hyphenated document ids it cannot read back ([conformance README](https://raw.githubusercontent.com/pid1/kosync-conformance/main/README.md)).
* **Document hash** (default "Binary" method): MD5 over up to 12 samples of 1024 bytes taken at offsets `1024 << (2*i)` for `i = -1..10`, where `i = -1` gives offset 0, stopping at first short read ([`util.partialMD5`](https://raw.githubusercontent.com/koreader/koreader/master/frontend/util.lua); first offset 0 confirmed in [conformance README](https://raw.githubusercontent.com/pid1/kosync-conformance/main/README.md)). Alternative method "Filename" hashes the filename ([main.lua](https://raw.githubusercontent.com/koreader/koreader/master/plugins/kosync.koplugin/main.lua)). Consequence: a file edited by Bookeeper (metadata rewrite, re-zip) changes its hash and breaks matching; store the hash of the original file or never rewrite files.
* Who implements the server side: Kavita (`/api/koreader/<api-key>`, since v0.8.7, archives, PDF, EPUB) ([Kavita wiki](https://wiki.kavitareader.com/guides/3rdparty/koreader/)); Komga (`/koreader`, API key as username, needs role `KOREADER_SYNC` and hashing enabled; EPUB progress only at chapter start, comics page-accurate) ([Komga docs](https://komga.org/docs/guides/koreader)); Calibre-Web-Automated 3.1.0 built-in `/kosync` ([release](https://newreleases.io/project/github/crocodilestick/Calibre-Web-Automated/release/V3.1.0)); Readest is a client of kosync ([Readest wiki](https://github.com/readest/readest/wiki/Sync-with-Koreader-devices)). Booklore's docs say KOReader sync only works for books downloaded from it via OPDS ([Booklore docs, via search result](https://booklore-app.github.io/booklore-docs/docs/integration/opds)).

### 3.2 OPDS
* **OPDS 2.0** is JSON, based on the Readium Web Publication Manifest model; collections (navigation, publications, groups, facets), URI-template links, schema.org-based metadata, living standard with core stable since 2017 ([spec](https://specs.opds.io/opds-2.0.html)). Predecessor is OPDS 1.2 (Atom) ([spec index](https://specs.opds.io/opds-1.2)).
* Clients: KOReader (OPDS with search) and Booklore note it; Komga's docs list KOReader, Moon+ Reader, Librera as tested with its OPDS v1.2 feed ([Komga OPDS guide](https://komga.org/docs/guides/opds)); Komga claims "OPDS v1 or v2" works with any reader ([Komga EPUB blog, search summary](https://komga.org/blog/ebook-support)); FBReader fully supports OPDS 2.0 ([FBReader news](https://fbreader.org/news/202506130000)); Readest supports OPDS and Calibre ([Readest](https://github.com/readest/readest)); Thorium has "full OPDS" **[version unverified]**. No authoritative OPDS 2.0 client matrix was found. Recommendation: ship OPDS 1.2 first for reach; add OPDS 2.0 later (cheap if you already emit Readium manifests).
* OPDS carries no progress sync ([Zotero forum summary via search](https://forums.zotero.org/discussion/comment/225791/)); progress is via kosync or app-specific sync.

### 3.3 Position and annotation models
* **Readium Locator** (JSON): `href`, `type`, `title`, `locations` {`fragments`, `progression` (in resource), `position`, `totalProgression` (in publication), extensions}, `text` {`before`, `highlight`, `after`} ([spec](https://readium.org/architecture/models/locators/)). Good as Bookeeper's canonical position record: serialisable, resource-based, tolerant to re-layout.
* **EPUB CFI** is what foliate-js uses; EPUB 3 canonical fragment identifiers are stable across layouts but brittle when the EPUB file is edited. Store both CFI (if foliate-js) and `totalProgression` for fallback and for kosync `percentage`.
* **W3C Web Annotation** is a W3C Recommendation (2017-02-23) with Selectors such as TextQuoteSelector, XPath, CSS, Fragment ([spec](https://www.w3.org/TR/annotation-model/)). Use it as export/import schema for highlights, with selectors `TextQuoteSelector` plus a position hint, rather than as the storage model.

### 3.4 How servers sync with external readers (summary)
* Kavita: kosync endpoint ([wiki](https://wiki.kavitareader.com/guides/3rdparty/koreader/)); also Kobo sync and OPDS feature pages ([wiki index](https://wiki.kavitareader.com/guides/features/opds/)). Known issue reports: HTTP 400 on progress path for a Boox device ([issue](https://github.com/Kareadita/Kavita/issues/4518)) **[title only]**.
* Komga: kosync ([docs](https://komga.org/docs/guides/koreader)); WebPub manifests for Readium clients ([blog](https://komga.org/blog/ebook-support)).
* Calibre-Web(-Automated): built-in kosync in CWA 3.1.0 ([release](https://newreleases.io/project/github/crocodilestick/Calibre-Web-Automated/release/V3.1.0)); third-party bridge uses filename matching ([vincentbitter/koreader-calibre-web-sync](https://github.com/vincentbitter/koreader-calibre-web-sync)).
* Booklore: KOReader sync, OPDS ([docs](https://booklore-app.github.io/booklore-docs/docs/integration/opds)).

---

## 4. Storage and delivery

### 4.1 HTTP range requests from axum
* `tower-http` 0.7.1 (MIT) offers `ServeFile`/`ServeDir`; docs show precompression support and a multi-range option, which implies range handling ([docs.rs ServeFile](https://docs.rs/tower-http/latest/tower_http/services/struct.ServeFile.html)). Exact ETag/Last-Modified behaviour **[unverified]**: test it.
* foliate-js and zip.js can open a `File`/`Blob` or a URL and use HTTP range requests for random access, avoiding loading whole files ([foliate-js README](https://github.com/johnfactotum/foliate-js): "Does not require loading whole file into memory", zip.js "supports random access ... HTTP range requests"). So serving the original `.epub`/`.cbz` with range support lets the browser read only the entries needed.
* Readium needs resources served separately, with a manifest; the ecosystem server is the Go `go-toolkit` which converts EPUB to Web Publications on the fly ([Readium Web](https://www.edrlab.org/software/readium-web/)). In Bookeeper this means writing a Rust endpoint that builds a manifest and streams zip entries (`zip` crate + `rbook` metadata).
* In Tauri: the built-in asset protocol returns 206 for ranges in 2.0.0 ([asset.rs](https://docs.rs/crate/tauri/2.0.0/source/src/protocol/asset.rs)); custom schemes can implement ranges manually ([streaming example](https://gitverse.ru/githubmirror/tauri/content/dev/examples/streaming/main.rs)); reports of seek problems on large files with the asset protocol and range failures on Android ([tauri-asset-bug](https://github.com/mauritzn/tauri-asset-bug), [discussion #12243](https://github.com/orgs/tauri-apps/discussions/12243)). Since Bookeeper's core already runs axum in-process, keep a single code path: load books from the loopback axum server in both modes.

### 4.2 Offline in a PWA
* WebKit policy (Safari 17+): origin quota up to 60% of disk for browser apps, 15% for other apps; Home Screen web apps get the same quotas as in a browser; eviction is per-origin LRU and excludes origins with active page or persistent storage; `navigator.storage.persist()` is granted on heuristics such as being a Home Screen web app; handle `QuotaExceededError` ([WebKit blog](https://webkit.org/blog/14403/updates-to-storage-policy/)). The older web.dev article's "about 1 GB for Safari" is outdated relative to this ([web.dev](https://web.dev/articles/storage-for-the-web)).
* ITP 7-day cap: script-writable storage (IndexedDB, LocalStorage, service worker registrations and cache) is deleted after 7 days without user interaction, but home screen web apps' first-party domain is **exempt** ([WebKit tracking prevention](https://webkit.org/tracking-prevention/)). Consequence: offline library on iOS only reliably persists if the PWA is installed to the Home Screen.
* Chrome: browser may use up to 80% of disk, origin up to 60%; Firefox: 50% of free disk, 2 GB per eTLD+1 group; best-effort data may be evicted LRU; persistent storage is not auto-cleared ([web.dev](https://web.dev/articles/storage-for-the-web)).
* Store choice per web.dev: Cache Storage for app shell/network resources, **OPFS for file-based content**, IndexedDB for other data ([web.dev](https://web.dev/articles/storage-for-the-web)). For e-books: whole-file Blobs in OPFS (or the Cache API keyed by URL so the service worker can answer range requests) and reading position/annotations in IndexedDB. Safari OPFS write-API completeness (e.g. `createWritable`, sync access handles in workers) **[unverified]**: test on iOS before choosing.
* Service worker must answer `Range` requests itself when serving cached files; Cache API `match` does not slice ranges **[general knowledge, unverified]**.

### 4.3 File sizes
* Text-heavy EPUB: about 1-2 MB (one report: 1.95 MB novel; "1 MB typical for a 300-page book with small graphics"); image-heavy EPUBs can be hundreds of MB ([Adobe forum](https://community.adobe.com/t5/indesign/why-are-my-epub-files-so-huge/td-p/9013481), [BiblioCrunch](https://blog.bibliocrunch.com/what-should-your-ebook-filesize-be/)). Retail ceilings: Amazon 50 MB, B&N 20 MB, Kobo 200 MB ([NetGalley](https://netgalleyclient.zendesk.com/hc/en-us/articles/4414642603671)).
* CBZ volumes and scanned PDFs: no reliable source found; typical figures (tens to a few hundred MB) are **[unverified]**. Plan quota-aware, per-book offline downloads with an explicit user choice.

---

## 5. Security of rendering untrusted EPUB

* Threats: scripted content (EPUB 3 allows JS), external resource loads (tracking, SSRF-ish via the viewer), `<form>` submission, `<object>`/`<iframe>`, malicious SVG, huge/zip-bomb archives, path traversal in zip entries, decompression cost (KF8 decompression is slow, [foliate-js README](https://github.com/johnfactotum/foliate-js)).
* foliate-js: no script support, but cannot enforce it itself; same-origin `blob:` iframes, so a script in a book would access the host page and its storage; mandatory host CSP blocking scripts except `'self'` ([README Security](https://github.com/johnfactotum/foliate-js)). A test EPUB with scripts exists at [johnfactotum/epub-test](https://github.com/johnfactotum/epub-test).
* Readium navigator 2.17: injects CSP with `connect-src 'none'`, `form-action 'none'`, `default-src` limited to allowed domains + `blob:`, `upgrade-insecure-requests`; but `script-src` includes `'unsafe-inline'` and the iframe sandbox has both `allow-same-origin` and `allow-scripts` (inspected `FrameBlobBuilder.ts`, `FrameManager.js`), so book scripts can still run inside the frame and with same-origin access to the blob document's parent chain. Mitigation is host-side.
* epub.js: scripts off by default, `allowScriptedContent` opt-in ([repo](https://github.com/futurepress/epub.js)).
* Recommended defence (design inference, not from a source): (1) host page CSP with `script-src 'self'` and no `unsafe-inline`; (2) serve book resources from a distinct origin (separate port or subdomain on the axum server) so same-origin does not expose the app's API/IndexedDB; in Tauri use a separate custom-protocol origin; (3) strip `<script>`, event handlers, and `javascript:` URLs in a sanitizing pass (foliate-js offers `transformTarget` events that can rewrite content as it loads, [README](https://github.com/johnfactotum/foliate-js)); (4) bound archive sizes and entry counts in Rust; (5) never open external links in the reader frame.

---

## 6. Recommendation: ranked engine options for Bookeeper

Stack facts: Tauri 2 (WebView2 / WKWebView / WebKitGTK), axum in-process or server, React 19 PWA with service worker.

1. **foliate-js (reflowable + FB2/MOBI/AZW3/CBZ) + pdf.js (PDF), wrapped in a thin React component.**
   * Pros: one engine for every target format incl. MOBI/AZW3 and FB2 and CBZ; MIT; demonstrated in Tauri v2 (Readest) and WebKitGTK (Foliate); random-access zip via range requests; CFI model; SVG overlayer fits highlight rendering; small and buildless.
   * Cons: not versioned or published to npm (vendor it, pin a commit); API unstable; no continuous scroll; search described as slow; FXL/spreads less polished; PDF adapter experimental (consider using pdf.js directly for PDFs); you must build UI (TOC, settings, annotation UI) and the CSP hardening yourself.
2. **Readium ts-toolkit navigator (EPUB reflowable/FXL, Divina comics) + pdf.js for PDF, plus an `epub/mobi -> manifest` layer in Rust.**
   * Pros: most actively maintained (releases within the last week); Locator model with `totalProgression` and text context maps neatly to Bookeeper progress, kosync percentage and Web Annotation; decorator, read-aloud, comics navigators included; OPDS 2.0 shares its manifest model so one manifest builder serves both; BSD-3.
   * Cons: needs a Readium manifest and per-resource HTTP serving (Rust work); no MOBI/AZW3/FB2 (convert at import or exclude); pre-1.0-style churn (breaking changes in minors); sandbox attributes weak; bundle size not measured; Thorium Web is Next.js-oriented, so you would use only the navigator packages.
3. **Hybrid**: Readium for EPUB and comics, foliate-js only when the file is MOBI/AZW3/FB2. Highest quality for EPUB but doubles integration, annotation, and position code. Not recommended for a first release.
4. **pdf.js alone for PDF** is required anyway; its WebKit support is "legacy build, Safari 18+, mostly" so test on iOS and WebKitGTK ([FAQ](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions)).
5. **epub.js**: not recommended (no release since 2022-02, 486 open issues).

My ranking for this stack: **1 (foliate-js) for the broadest format coverage and lowest server work; 2 (Readium) if EPUB/comics quality, sync model and long-term maintenance matter more than MOBI/FB2.** Decision lever: how many family files are MOBI/AZW3/FB2 vs EPUB. A cheap spike (one day each, on iOS Safari standalone PWA and on WebKitGTK) should settle the choice.

---

## 7. Main technical risks

1. **Engine API stability**: foliate-js has no releases and warns of breakage; Readium has breaking minors. Mitigate with a thin adapter interface (`open`, `goTo`, `onRelocate`, `highlight`, `search`) and pinned versions.
2. **WebKit multi-column and layout regressions** (WKWebView, WebKitGTK, iOS standalone PWA); needs a device test matrix. See §1.2.
3. **Untrusted book content**: same-origin blob frames, script permissions; needs separate origin plus CSP. See §5.
4. **iOS PWA offline storage**: eviction and 7-day cap unless installed to Home Screen; quota errors; unverified OPFS behaviour; service-worker range responses.
5. **Position portability**: kosync `progress` is a crengine xpointer, not a CFI; Komga keeps only chapter-level EPUB progress; plan on `percentage` plus chapter index for interop and your own Locator for in-app precision.
6. **File hash stability**: kosync partial-MD5 breaks if Bookeeper rewrites files; compute and store the hash at import, and treat library files as immutable (write metadata in the database, not in the file).
7. **Licensing**: `epub` crate GPL-3.0-or-later; `mupdf` AGPL; Readest (AGPL) and Foliate (GPL) are references, not code to copy; verify Bookeeper's own license before choosing.
8. **MOBI/AZW3 and DRM**: no maintained Rust parser; Kindle files are often DRM-protected (not researched; **[unverified]**). Decide whether to import-convert (Calibre) or rely on foliate-js.
9. **Search and large books**: foliate-js search is slow; plan server-side full-text index (e.g. SQLite FTS5 built during import) for library-wide search.
10. **Tauri protocol quirks**: asset-protocol range seeking issues reported on Android and for large files; serving from loopback axum avoids that but requires a local port and auth token handling.
11. **WebView2 / Linux runtime variance**: Readest documents WebView2 and Wayland/X11 start-up failures ([README](https://github.com/readest/readest)).

---

## 8. Open questions not resolved in this pass

* Exact Readium navigator runtime bundle size and whether text search ships in `@readium/navigator` 2.17.
* Safari OPFS and service-worker range behaviour on iOS 26.
* Current foliate-js open WebKit issues (GitHub issue tracker was not reachable via API).
* MOBI/AZW3 metadata crate options beyond `mobi` 0.8.0 (2022).
* OPDS 2.0 client matrix with sources.
