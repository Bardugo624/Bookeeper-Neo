# Bookeeper: e-ink device integration (research, 2026-11-27)

Method: about 25 web lookups. Every claim carries the URL it came from. Items I could not verify are marked **UNVERIFIED**. Lookup tools returned summaries of pages, so exact wording and numbers should be re-checked against the linked page before they go into a spec. Nothing here covers DRM removal.

OPDS and kosync are covered by another report. One line each: OPDS is the catalog/download route that KOReader and several native readers consume (e.g. https://standardebooks.org/help/how-to-add-an-opds-feed-to-your-ereader); kosync is the KOReader progress protocol that Kavita (https://wiki.kavitareader.com/guides/3rdparty/koreader/), BookBoss (https://szinn.github.io/BookBoss/user/koreader.html) and Calibre-Web Automated (https://github.com/crocodilestick/Calibre-Web-Automated/wiki/Kobo-Integration-&-Sync) implement.

---

## 1. Kobo, stock firmware ("emulate the Kobo store API")

### Mechanism
- The Kobo reads its store base URL from `.kobo/Kobo/Kobo eReader.conf`. Under `[OneStoreServices]`, `api_endpoint` defaults to `https://storeapi.kobo.com`. The user changes it to the self-hosted server URL (https://www.github.com/janeczku/calibre-web/wiki/Kobo-Integration, https://komga.org/docs/guides/kobo).
- Komga's endpoint format is `https://<host>/kobo/<api_key>`. The per-user, per-device API key is embedded in the URL, so the URL is as sensitive as a password (https://komga.org/docs/guides/kobo).
- Calibre-Web Automated (CWA) generates a "Kobo Auth URL" in user settings (https://github.com/crocodilestick/Calibre-Web-Automated/wiki/Kobo-Integration-&-Sync).
- Booklore (now forked as Grimmory) uses an API token created in the app. A Grimmory issue log shows paths like `/api/kobo/.../v1/initialization` and `/v1/library/sync` (https://github.com/grimmory-tools/grimmory/discussions/1300). Booklore docs: https://booklore-app.github.io/booklore-docs/docs/devices/kobo (the page was not fetchable; only search snippets were seen).
- The Kobo-facing protocol is not documented by Kobo. A MobileRead thread asks for documentation (https://www.mobileread.com/forums/showthread.php?p=4192141). Prosa-Kobo's API docs say the endpoints Kobo calls "imitate Kobo's own servers" and are not described (https://tiago-cos.github.io/prosa-kobo). Implementers copy the protocol from existing projects or from device packet logs (Komga documents `devmodeon`, `sync` and `packetdump` log categories streamed via `nc <kobo ip> 5001`: https://komga.org/docs/guides/kobo).
- Calibre-Web's code implements: entitlement/sync endpoints, a `/v1/initialization` resources response that rewrites store URLs, and a reading-state endpoint (https://github.com/janeczku/calibre-web/blob/master/cps/kobo.py, read as raw source).

### Who does it (open source)
| Project | Kobo sync | Source |
|---|---|---|
| Calibre-Web (and Calibre-Web Automated fork) | yes, since ~2020; CWA actively documented | https://www.github.com/janeczku/calibre-web/wiki/Kobo-Integration , https://github.com/crocodilestick/Calibre-Web-Automated/wiki/Kobo-Integration-&-Sync |
| Komga | yes, EPUB only, two-way progress | https://komga.org/docs/guides/kobo |
| Booklore / Grimmory | yes; PDF not supported; Booklore reader and Kobo progress tracked separately | search summary of https://booklore-app.github.io/booklore-docs/docs/devices/kobo (page not fetchable), https://github.com/grimmory-tools/grimmory |
| BookBoss | yes; auto EPUB-to-KEPUB; position, percent, time spent | https://szinn.github.io/BookBoss/user/kobo.html |
| Prosa-Kobo (for the Prosa server) | yes, device linking API | https://tiago-cos.github.io/prosa-kobo |
| Kavita | **No Kobo-sync evidence found**; it supports KOReader sync only | https://wiki.kavitareader.com/guides/3rdparty/koreader/ (a Tildes thread that lists Kavita among Kobo-capable managers was not confirmed: https://tildes.net/~books/1v2d/ebook_management_for_kobo) |

### What syncs
- Book delivery, metadata, covers: Komga "metadata and cover edits update on the device; books deleted in Komga are deleted on the device" (https://komga.org/docs/guides/kobo). CWA: title, author, series, description, tags, dates, ratings, covers; full-library mode or per-shelf mode (https://github.com/crocodilestick/Calibre-Web-Automated/wiki/Kobo-Integration-&-Sync).
- Reading progress: Komga "read progress syncs both ways" (https://komga.org/docs/guides/kobo). CWA says reading position, bookmarks and statistics sync (https://github.com/crocodilestick/Calibre-Web-Automated/wiki/Kobo-Integration-&-Sync). Trigger events per CWA: page turns, closing a book, switching books, connecting to Wi-Fi.
- Calibre-Web's older wiki says progress and statistics are stored but only Read/Unread is shown (https://www.github.com/janeczku/calibre-web/wiki/Kobo-Integration).
- Annotations/highlights: Komga's page does not mention them. CWA exports Kobo highlights and notes to Hardcover.app (not back to its own UI), needs `hardcover-id/edition/slug` on each book, and cannot import older annotations (https://github.com/crocodilestick/Calibre-Web-Automated/wiki/KOBO_ANNOTATION_SYNC). So server-side highlight storage is not a standard feature of the protocol implementations I found.

### How progress is represented
- Calibre-Web stores per user and book: `ProgressPercent`, `ContentSourceProgressPercent`, and a `Location {Value, Type, Source}` object; plus `Statistics` (`SpentReadingMinutes`, `RemainingTimeMinutes`) and `StatusInfo` (read status) (https://github.com/janeczku/calibre-web/blob/master/cps/kobo.py).
- The location Value/Type/Source is a pointer into Kobo's own content structure (KEPUB spans/chapters), not a generic CFI. That is why a non-Kobo reader cannot reuse it directly. (Interpretation from the field names above; the value format itself was not documented in the sources.)
- Komga: for pre-paginated books progress is accurate per page; for plain EPUB, "Kobo tracks progress only at chapter starts" so mid-chapter progress is lost; for KEPUB, mapping may be "off by a few pages" (https://komga.org/docs/guides/kobo).
- CWA's annotation feature estimates progress by parsing the EPUB/KEPUB spine and counting characters per chapter (https://github.com/crocodilestick/Calibre-Web-Automated/wiki/KOBO_ANNOTATION_SYNC).

### KEPUB / kepubify
- Komga converts EPUB to KEPUB on download if kepubify is available (bundled in its desktop apps and Docker images) (https://komga.org/docs/guides/kobo).
- CWA converts automatically when `kepubify` is configured; inputs EPUB and KEPUB (https://github.com/crocodilestick/Calibre-Web-Automated/wiki/Kobo-Integration-&-Sync). Calibre-Web's code converts EPUB to KEPUB when a kepubify path is configured (https://github.com/janeczku/calibre-web/blob/master/cps/kobo.py).
- BookBoss converts to KEPUB automatically (https://szinn.github.io/BookBoss/user/kobo.html).
- Whether KEPUB is strictly required for progress and stats: Komga's wording ("for plain EPUB Kobo tracks progress only at chapter starts") implies plain EPUB works with coarser progress; I found no source that states a hard requirement. **UNVERIFIED**.

### One-time setup on the device
- Connect by USB, edit `Kobo eReader.conf` (hidden folder), restart, sync. Booklore estimates 10-15 min first-time (search summary). Komga: separate key per device (https://komga.org/docs/guides/kobo).

### Limits and risks
- Newer models can overwrite the edit: CWA says "Kobo eReader.conf will be automatically restored and the line erased on some newer models" (e.g. Libra Colour) and then `image_host`, `image_url_template`, `image_url_quality_template` must be set manually (https://github.com/crocodilestick/Calibre-Web-Automated/wiki/Kobo-Integration-&-Sync). A user reported a Clara 2E reverting to the Kobo store (search summary; source: https://www.github.com/janeczku/calibre-web/issues/1470 family, not fetched).
- Undocumented, reverse-engineered API: it can break with firmware. Example: "Sync failed, try again later" on a Clara 2E against Grimmory even after re-pairing (https://github.com/grimmory-tools/grimmory/discussions/1300).
- PDFs: Kobo devices do not sync PDF via this route (https://www.github.com/janeczku/calibre-web/wiki/Kobo-Integration); Booklore docs say the same (search summary).
- Only EPUB for Komga (https://komga.org/docs/guides/kobo). CBZ via this route: not supported in Komga's docs; **UNVERIFIED** elsewhere.
- Large libraries may time out (https://www.github.com/janeczku/calibre-web/issues/1276, cited in the Calibre-Web wiki). Large request headers can break behind reverse proxies (https://www.github.com/janeczku/calibre-web/wiki/Kobo-Integration).
- The Kobo sends an invalid HTTP Host header; external port setting needed in Docker/reverse-proxy setups (https://komga.org/docs/guides/kobo).
- Security: the device id/user id pair is sent; without TLS it can be intercepted (https://www.github.com/janeczku/calibre-web/wiki/Kobo-Integration). Komga: use HTTPS only (https://komga.org/docs/guides/kobo).
- "Proxy unknown requests to Kobo Store" is optional; without it the device loses access to store purchases through the same endpoint (CWA, Calibre-Web, Komga pages above).
- Opening the endpoint URL in a browser can count as a sync and break later syncs (search summary of Calibre-Web docs; **UNVERIFIED** wording).
- Project health: Booklore forked into Grimmory (https://github.com/grimmory-tools/grimmory), so project continuity varies.

### Per user reports
- Works for many people for delivery; progress fidelity is the weak part (chapter-granular for plain EPUB per Komga). Failures cluster around firmware, reverse proxies and new models (links above). No quantitative reports found.

## 2. Kobo with KOReader
Use OPDS plus kosync (see above). A plugin, kobo.koplugin, can also sync KOReader progress with Kobo's own database so stock-Kobo sync still sees it (https://ogkevin.github.io/kobo.koplugin/features/reading-state-sync.html, https://github.com/OGKevin/kobo.koplugin).

## 3. Kindle

### Send to Kindle by email
- Each Kindle has a Send to Kindle address. Sender must be on the Approved Personal Document Email List (up to 15 approved senders), up to 25 attachments, total 50 MB per email; ZIP files are opened by the conversion service. Delivery is attempted up to 60 days (https://digprjsurvey.amazon.co.uk/csad/help/node/G7NECT4B4ZWHQ8WV, an Amazon help page mirror).
- Formats: EPUB accepted since late 2022 (https://www.gsmarena.com/you_can_now_upload_epub_books_to_your_kindle_over_email-news-54180.php). Web upload at https://www.amazon.com/sendtokindle lists PDF, DOC, DOCX, TXT, RTF, HTM, HTML, PNG, GIF, JPG, JPEG, BMP and EPUB, limit 200 MB (https://blog.the-ebook-reader.com/2022/11/17/new-send-to-kindle-webpage-can-send-epubs-and-documents-to-kindles/). The email page does not list formats itself. CBZ: not in these lists.
- EPUB is converted by Amazon on receipt; a forum user reports automatic conversion (MobileRead, search summary). Conversion details and quality: **UNVERIFIED**; formatting problems on sent EPUBs exist and have how-to fixes (same the-ebook-reader article).
- Other routes: Send to Kindle web, apps for Windows/Mac (EPUB added: https://blog.the-ebook-reader.com/2022/12/20/send-to-kindle-apps-for-pc-and-mac-now-support-epub/). USB "Download & Transfer" for purchased books was removed in 2025 (date reports differ; secondary sources via search: https://pctipp.ch/themen/news/amazon-baut-funktionen-kindle-ab). That concerns purchased books, but it shows Amazon narrowing local transfer.
- April 2026: Kindles released before 2013 lose Send to Kindle/email delivery (USB only) (https://blog.the-ebook-reader.com/2026/04/13/send-to-kindle-wont-work-on-unsupported-kindles-amazon-phasing-out-older-formats/).

### Does progress come back to the server?
- **No.** I found no Amazon API or documented mechanism that exposes personal-document reading progress to a third-party server. State this as impossible via any supported route; absence of evidence, not a documented statement.
- What does exist: Amazon's Whispersync syncs last page read, bookmarks and annotations among the user's Kindle devices/apps for sent documents, except PDFs (Amazon 2011 announcement reproduced at https://help.fivefilters.org/push-to-kindle/personal-documents-features.html; dated, current behavior **UNVERIFIED**).

### Self-hosted "send to Kindle" features
- Calibre-Web: mail server (SMTP) configured in admin; the sender address must be whitelisted in Amazon's approved list; e.g. Gmail smtp.gmail.com:587 STARTTLS with app password or OAuth2 (https://github-wiki-see.page/m/janeczku/calibre-web/wiki/Setup-Mailserver, https://www.github.com/janeczku/calibre-web/wiki/Additional-Configuration-for-Kindle-E-Mail).
- Kavita: "Send To device" uses an email service configured by the admin; its built-in emailer was shut down with 0.8.0 (14 Apr 2024), so users bring their own SMTP account (https://wiki.kavitareader.com/guides/admin-settings/email/).
- Audiobookshelf has a send-to-ereader guide for the same pattern (https://www.audiobookshelf.org/guides/send_to_ereader/).
- Risk: personal Gmail/Outlook SMTP needs app passwords; residential IPs and shared providers get throttled (**UNVERIFIED**, forum anecdotes).

## 4. PocketBook
- **Send-to-PocketBook**: enable on the device (Settings, Accounts and Synchronization), email files to the device's unique address, books download automatically (https://pocketbook.ch/en-ch/faq, https://pocketbook.ch/en-ch/news/unlock-the-full-potential-of-your-pocketbook-ch). Size limit: not stated in sources.
- **PocketBook Cloud**: uploads via website sync to the device; the PocketBook Reader app (iOS/Android) syncs library and reading positions between the cloud, app and device (https://pocketbook.ch/en-ch/news/unlock-the-full-potential-of-your-pocketbook-ch). No public third-party API found, so a server cannot read the progress. **UNVERIFIED** (absence of evidence).
- **OPDS**: forum threads describe a "Network Libraries" menu in PocketBook Reader where a feed URL is added; a user got Calibre OPDS working, but the OPDS reader ignored the separate user/password fields for individual downloads, so credentials had to go in the URL (MobileRead, search summary, https://www.mobileread.com/forums/showthread.php?p=4579519 family). Third-party clients: https://github.com/j2robin/Pocketbook-OPDSClient, https://codeberg.org/codedge/pb-opds-connector (WIP).
- Formats accepted natively: EPUB (incl. DRM), PDF, FB2, MOBI, CBZ, CBR, DJVU and more (https://products.pocketbook.ch/ listing, summary).
- Progress back to a server: no native route found. Options: KOReader on PocketBook is not established by my sources (**UNVERIFIED**).

## 5. Tolino
- Official: sideload by USB into the "Books" folder; formats PDF, EPUB, TXT, MOBI, CBZ, CBR; purchased books come via the tolino cloud (https://mytolino.com/faq/how-can-i-import-books-ive-already-purchased-or-upload-my-own-content-onto-the-tolino-ereader-side-loading/).
- No evidence of stock OPDS or WebDAV support (searches found none; **UNVERIFIED**, absence of evidence).
- Unofficial cloud route: tolino-calibre-sync uses the reverse-engineered tolino web-reader REST API with the user's reseller login (Thalia, Buch.de, Hugendubel, Osiander, orellfuessli, Buecher.de); uploads EPUB, covers, metadata, one collection per series; one-way only; matches by full title; spec not available; "may break when providers change authentication" (https://github.com/darkphoenix/tolino-calibre-sync). Hugendubel is listed non-functional.
- Progress back: none in that project.

## 6. Onyx Boox and other Android e-ink
- **KOReader on Boox**: works as an Android app; OPDS, RSS and sync (kosync) come with it; KOReader supports only HTTP basic auth (https://ocdevel.com/blog/20261013-ereader-opds-rss-calibre-koreader). Boox's own library does not see KOReader progress by default; a community plugin syncs position into the Boox library and requires "Unfreeze" because Onyx freezes newly installed apps (https://www.mobileread.com/forums/showthread.php?p=4516462 family, search summary).
- **Readest**: documents KOReader-sync interoperability, OPDS on Android, and a KOReader plugin with annotation sync (https://apps.apple.com/app/id6738622779, release notes). Readest on Boox specifically: **UNVERIFIED**.
- **NeoReader OPDS, Moon+ Reader, Librera**: no source found in this session (**UNVERIFIED**). Booklore's docs reportedly list Boox "native reader" as an OPDS client (search snippet only; the page returned 404 when fetched).
- **Phone PWA in the Boox browser**: no sources found. The only facts available: Boox is a regular Android device (**UNVERIFIED** for PWA install and e-ink refresh behavior).

---

## Summary table

| Device | How books get there | Progress back to server? | Setup effort | Risk |
|---|---|---|---|---|
| Kobo, stock | Kobo-API emulation (api_endpoint), EPUB to KEPUB, covers and metadata | Yes, percent + Kobo location + stats; chapter-granular for plain EPUB | Medium: USB edit of hidden config per device | Undocumented API, firmware can revert config, PDF not synced, TLS and key hygiene |
| Kobo + KOReader | OPDS | Yes via kosync | Medium-high: install KOReader | Low; third-party app |
| Kindle | Email via SMTP to Send to Kindle address (EPUB converted by Amazon), or web upload | **No** (Whispersync stays inside Amazon) | Low: add sender to approved list | Amazon policy changes, old models cut off in 2026, conversion quality |
| PocketBook | Send-to-PocketBook email, Cloud, or OPDS "Network libraries" | No native route found | Low-medium | OPDS auth quirk; no progress API |
| Tolino | USB; unofficial tolino-cloud API script | No | Low (USB) / high (script) | Unofficial API, one-way |
| Boox / Android e-ink | KOReader (OPDS), Readest, browser | Yes via kosync (KOReader/Readest) | Low-medium | Freeze policy, app-specific |

## Recommendation: build order
1. **OPDS 1.2 with basic auth plus kosync** (already in the other report): one server feature covers KOReader on Kobo, Boox, PocketBook (client-dependent), Readest and phones, with real two-way progress. Widest coverage per unit of work.
2. **Per-user "Send to device" via SMTP** (Kindle, PocketBook, others with email delivery): small, well-understood (Calibre-Web, Kavita precedent). Offer EPUB as-is; note that progress cannot return for Kindle and tell the user so in the UI.
3. **Kobo store-API emulation** (EPUB + KEPUB via kepubify, reading state with percent and location): highest friction for the user and highest maintenance burden, but the only seamless stock-Kobo path; Komga and CWA are the reference implementations (links above). Do it after 1 and 2, EPUB only, HTTPS only, per-device keys, keep the protocol layer isolated.
4. Skip Tolino scripting and PocketBook-specific work; document USB/OPDS as the fallback.
5. Keep the PWA as universal fallback, but verify on a Boox before promising anything.

Store the app's own progress model as percentage plus an opaque per-protocol position (kosync string, Kobo location triple), as the sources show these are not interchangeable.
