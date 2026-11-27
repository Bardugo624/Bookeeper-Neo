# E-book reader experience: prior art for Bookeeper

Scope: user-facing experience of existing readers (not rendering libraries). About 35 lookups, June-Nov 2026 snapshot. Facts below come from the cited pages. "Not verified" marks gaps. The web-search tool returned mostly app-store listings, vendor docs and blogs; direct Reddit/HN/MobileRead threads were rarely returned, so the "praise" and "hate" sections lean on reviews, roundups and forum snippets and say so.

## 1. Product notes

### Commercial

**Apple Books** (iOS, iPadOS, macOS only).
- Themes & Settings menu: themes, fonts, layout; page-turn style choices Curl, Fast Fade, Scroll ([MacRumors](https://www.macrumors.com/how-to/re-enable-page-turning-animation-apple-books/), [Apple forums](https://discussions.apple.com/thread/254426389)).
- Mac version lacked vertical scroll for a time ([Apple forum](https://discussions-cn-prz.apple.com/thread/255467460)).
- Reading goals, collections, PDF reading, annotation, sync across Apple devices per the [iPhone guide TOC](https://support.apple.com/guide/iphone/read-books-iph1ae6d0bf3/ios).
- Review: clean UI, good dark mode and font controls, side-loaded EPUB works, but annotation export is hard to use with Readwise and audiobook/ebook position does not sync ([Unstar](https://unstar.app/blog/kindle-apple-books-kobo-libby-scribd-ereader-apps-ranked-2026)).
- Notable: the curling page-turn animation was removed once and users complained ("jarring"), then it came back as an option ([Apple forum](https://discussions.apple.com/thread/254383161)).

**Kindle** (apps for iOS/Android/Mac/Win, Kindle Cloud Reader, devices).
- Dictionary, X-Ray, Wikipedia lookup, translation, in-book search, My Notebook ([App Store](https://apps.apple.com/app/kindle/id302584613), [iClarified](https://www.iclarified.com/40135/amazon-updates-kindle-app-for-ios-with-table-of-contents-xray-smart-lookup-improvements)).
- Whispersync keeps last page, notes, bookmarks, highlights in step ([Good e-Reader](https://goodereader.com/blog/?p=263641)). Popular Highlights is shown on all Kindle platforms ([Android Authority](https://www.androidauthority.com/kindle-popular-highlights-3634804), [Nerdschalk](https://nerdschalk.com/turn-off-popular-highlights-on-kindle/)).
- X-Ray does not work on sideloaded books ([Good e-Reader](https://goodereader.com/blog/?p=263641)).
- Cloud Reader: in-browser reading with notes, highlights, bookmarks ([Chrome Web Store](https://chrome.google.com/webstore/detail/icdipabjmbhpdkjaihfjoikhjjeneebd)).
- Complaints: iOS in-app purchase blocked, home screen dominated by recommendations, iPad layout wastes space, annotation export needs third-party tools, position sometimes jumps back 20-50 pages ([Unstar](https://unstar.app/blog/kindle-apple-books-kobo-libby-scribd-ereader-apps-ranked-2026)). iPhone roundup: fixed fonts/spacing/themes ([ITNext](https://itnext.io/the-customizable-epub-reader-for-iphone-i-wanted-5c966b4eaecc)).

**Kobo app** (iOS, Android; web reader).
- Reading Settings (tap middle, font icon): tone (page colour, brightness), font size and type, margins, line spacing, alignment, page-transition animation, orientation lock ([Kobo help](https://help.kobo.com/hc/en-us/articles/360017865293-Adjust-page-margins-line-spacing-and-more-on-the-Kobo-Books-app-iOS-Android)). Web reader exists ([Kobo help](https://help.kobo.com/hc/en-us/articles/35996239522967)).
- Reading Life: stats, awards, check-ins, social sharing ([Kobo](https://www.kobo.com/readinglife), [Kobo blog](https://www.kobo.com/blog/https-news.kobo.com-introducing-kobo-reading-stats)).
- Review: polished UI, no recommendation clutter, strong dictionary/translation; mobile annotation export limited; no sync of sideloaded files, no Send-to-Kobo ([Unstar](https://unstar.app/blog/kindle-apple-books-kobo-libby-scribd-ereader-apps-ranked-2026), [The eBook Reader](https://blog.the-ebook-reader.com/2026/03/11/list-of-the-main-flaws-for-each-of-the-top-ereader-brands)).

**Google Play Books** (Android, iOS, web).
- You can upload your own EPUB and PDF and read on any signed-in device; PDF uploading is a setting; highlights/notes sync for PDFs uploaded after 2026-01-20 ([Google help](https://support.google.com/googleplay/answer/11012086?hl=en)).
- Complaints: DRM'd uploads stall at "processing"; some EPUB 3 files rejected ([CommonsWare](https://commonsware.com/blog/2017/03/01/google-play-books-epubs.html), [Leanpub](https://help.leanpub.com/en/articles/7940096-i-m-trying-to-upload-a-leanpub-book-to-google-play-and-it-s-not-working-what-can-i-do)); mostly 2013-2017 sources, treat as dated.

**Readwise Reader** (web, iOS, Android, desktop apps; subscription).
- One inbox for articles, newsletters, EPUBs, PDFs, videos, tweets; RSS feed; browser extension; drag-and-drop upload; import from Pocket/Instapaper; TTS with AI voices; text size, paged scroll, dark mode ([Readwise docs](https://docs.readwise.io/reader/docs)).
- Ghostreader: AI assistant (define, summarise, ask questions, context-aware of position) ([Readwise changelog](https://docs.readwise.io/changelog), [update page](https://readwise.io/reader/update-june2025)). Highlights sync to Readwise Daily Review.
- EPUB engine reworked for performance; "original styles" toggle ([App Store](https://apps.apple.com/app/id1567599761)).

**BookFusion** (web, iOS, Android).
- Cloud library plus reader for EPUB, PDF, CBZ/CBR; Calibre plugin; syncs progress, highlights, bookmarks; highlights exportable as CSV/Markdown/HTML/PDF; Send to Kindle ([App Store](https://apps.apple.com/us/app/bookfusion/id1141834096)).
- One review: missing time left in chapter/book; a user reports a 35 MB upload limit (user claim, not official).

**PocketBook Reader** (Android, iOS).
- About 26 book/audio formats; PocketBook Cloud syncs library, position, settings, notes and bookmarks with iOS/Android and E Ink devices ([PocketBook](https://pocketbook.ch/en-ch/news/unlock-the-full-potential-of-your-pocketbook-ch), [App Store](https://apps.apple.com/us/app/id805488884)). Some reviewers call sync poor. Send-to-PocketBook is a device e-mail feature, not confirmed in the app.

### Open source and indie

**Readest** (macOS, Windows, Linux, Android, iOS, web; Tauri-based, same stack family as Bookeeper).
- EPUB, MOBI, AZW3, KF8, FB2, CBZ, TXT, HTML, Markdown; PDF improving ([GitHub](https://github.com/readest/readest), [It's FOSS](https://itsfoss.com/news/readest-app/)).
- Scroll or paginated; Parallel Read (two books side by side); reading ruler; paragraph-by-paragraph and speed-reading modes; font, layout, theme, custom CSS.
- Tooltip on selection: highlight, note, dictionary, Wikipedia, DeepL/Yandex translation (sentence or whole book), TTS with multilingual switching; Read-Along narration for EPUB3 media overlays.
- Library: OPDS and Calibre integration; sync of files, progress, notes, bookmarks via Readest account; KOReader progress/notes sync ([Readest wiki](https://github.com/readest/readest/wiki/Sync-with-Koreader-devices)). Export to Readwise, Hardcover integration ([App Store](https://apps.apple.com/us/app/id6738622779)).
- Reviewer: "deepest feature set I've seen" but still v0.x and some features unfinished ([Bubbles](https://bubbles.town/entry/44742591)).

**Koodo Reader** (Windows, macOS, Linux, web, iOS).
- Many formats (EPUB, PDF, MOBI, AZW3, TXT, FB2, CBZ/CBR, DOCX, MD...). Single/double column or continuous scroll, TTS, translation.
- Sync to OneDrive, Google Drive, Dropbox, WebDAV, S3, SFTP, etc. or Koodo Sync; notes/highlights sync to Notion, Readwise, Yuque ([App Store](https://apps.apple.com/us/app/id6744887779), [SourceForge](https://sourceforge.net/mirror/koodo-reader)).

**Thorium Reader** (Windows, macOS, Linux; EDRLab).
- EPUB 2/3 incl. fixed layout, PDF, DAISY, audiobooks, comics; Readium LCP DRM support; screen-reader compatibility (JAWS, NVDA, Narrator, VoiceOver); adjustable fonts/spacing, keyboard shortcuts, TTS, full-text search, bookmarks, OPDS ([EDRLab](https://www.edrlab.org/software/thorium-reader/), [Thorium docs](https://thorium.edrlab.org/en/docs/_print/)). Accessibility-first; used for library lending.

**Foliate** (Linux/GNOME, GTK).
- EPUB, MOBI/Kindle, FB2, CBZ, PDF; paginated or scrolled; light/sepia/dark/invert; progress slider with chapter marks; full-text search including annotations; dictionary lookup; bookmarks and annotations; OPDS (Gutenberg, Standard Ebooks); TTS via eSpeak/Festival ([Flathub](https://flathub.org/apps/com.github.johnfactotum.Foliate), [Wikipedia](https://en.wikipedia.org/wiki/Foliate_(software))).

**KOReader** (Kobo, Kindle, PocketBook, reMarkable, Android, Linux, macOS).
- Formats: PDF, EPUB, MOBI, FB2, DJVU, CBZ, DOCX, RTF, HTML, TXT, CHM, and more.
- Deepest typography: own TTF/OTF fonts, size, weight, contrast, kerning, line spacing, margins, word spacing, alignment, per-book settings, profiles, style tweaks and custom CSS, bundled hyphenation dictionaries ([User guide](https://koreader.rocks/user_guide/), [alternatives roundup](https://itnext.io/the-customizable-epub-reader-for-iphone-i-wanted-5c966b4eaecc)).
- Tap-and-hold lookup in dictionaries and Wikipedia; highlights in several styles with two-tap multi-page selection; export to text, Markdown, HTML, JSON, Kindle clippings, Joplin, Readwise.
- Statistics plugin (time, calendar views), Book Map; OPDS, Dropbox/FTP/WebDAV, Calibre wireless, RSS.
- Progress sync: built-in kosync plugin works with any compliant server; official server only syncs progress ([Readest wiki](https://github.com/readest/readest/wiki/Sync-with-Koreader-devices), [KoInsight](https://github.com/dev107/KoInsight)). Komga, Booklore, Calibre-Web-Automated expose kosync endpoints ([Komga](https://komga.org/docs/guides/koreader)).
- Reviews: works well on e-ink; "UI is very odd", "notepad++/vim level learning curve" ([MobileRead / r/macapps via search](https://reddit.birdcat.cafe/r/macapps/comments/1iyv958/introducing_readest_a_free_and_modern_ebook/mthni7b/?context=3)).

**Calibre E-book viewer** (Windows, macOS, Linux; also browser viewer in Content server).
- Paged or flow mode (Ctrl+M); colour schemes; margins; custom user stylesheet and background image; search modes (contains, whole word, nearby, regex); highlights panel by chapter and library-wide browse; bookmarks saved inside the EPUB; double-click lookup with customisable sources; read aloud with word/sentence highlighting (Piper or OS TTS); headers/footers can show time left, chapter, position; extensive customisable shortcuts; annotations syncable with Content server viewer ([Manual](https://manual.calibre-ebook.com/viewer.html)).
- Library side: the Calibre desktop itself (conversion, metadata editing, plugins) is the library manager.

**Calibre-Web** (self-hosted web app over a Calibre DB).
- Browse, download, in-browser reading for several formats, metadata editing, one-click send to e-reader by e-mail, Kobo sync, OPDS ([GitHub](https://github.com/janeczku/calibre-web)). Fork Calibre-Web Automated adds two-way Kobo sync ([wiki](https://github.com/crocodilestick/Calibre-Web-Automated/wiki/Kobo-Integration-&-Sync)).

**Kavita** (self-hosted; web, PWA-friendly).
- EPUB reader: scroll / 1-column / 2-column; vertical writing; size, line spacing, margin; custom fonts; themes Dark, Black (OLED), White (E-Ink), Paper; resume position across devices; ToC; go to page; estimated time to finish; text and image bookmarks; annotation system with colour slots, spoiler control, export ([Kavita wiki](https://wiki.kavitareader.com/guides/readers/epub/)). OPDS feeds for third-party apps.

**Komga** (self-hosted; comics-first).
- Web reader with double-page spread, RTL; OPDS and OPDS-PSE; KOReader sync (role-based, chapter-start granularity for regular EPUB) and native Kobo Sync ([Komga docs](https://komga.org/docs/guides/koreader), [Kobo guide](https://komga.org/docs/guides/kobo)). Sources disagree on how much EPUB reading Komga offers ([selfhosting.sh](https://selfhosting.sh/compare/kavita-vs-komga/)); not verified.

**Booklore** (self-hosted multi-user library).
- Built-in reader for EPUB, PDF, comics; per-user progress; multi-user with OIDC; metadata fetch from Goodreads, Amazon, Google Books; Magic Shelves (rule-based smart collections, can be public in OPDS); OPDS; KOReader sync and Kobo sync ([docs](https://booklore-app.github.io/booklore-docs), [magic shelf](https://booklore-app.github.io/booklore-docs/docs/magic-shelf), [Gigazine review](https://gigazine.net/news/20260215-booklore)).
- At Feb 2026 review: KOReader progress synced one direction only; bookmark/highlight sync not working. Search results mention a successor fork "Grimmory" ([GitHub](https://github.com/grimmory-tools/grimmory)); the project's current state is not verified, check before depending on it.

### Android favourites

- **Moon+ Reader**: free with ads, Pro unlock; long-standing "most feature-rich" reputation; TTS, tilt/gesture page turns, themes, progress within chapter ([MobileRead wiki](https://wiki.mobileread.com/wiki/Moon+_Reader), [Technipages](https://www.technipages.com/moon-reader-pro-complete-guide), [comparison](https://androidayuda.com/aplicaciones/listas/librera-vs-moon-reader-vs-readera-la-comparativa-definitiva-para-leer-en-android/)). Only TTF custom fonts per one forum user ([MobileRead](https://www.mobileread.com/forums/showthread.php?p=3790007)). Details are from older sources.
- **ReadEra**: free, ad-free, no account, "just open and read"; many formats (EPUB, MOBI, PDF, DJVU, FB2, DOC...), ToC, search, bookmarks, notes, quotes ([Gizmodo](https://gizmodo.com/download/readera-book-reader-pdf-epub), comparison above).
- **Librera**: free, open source; PDF, EPUB, MOBI, DjVu, FB2, CBZ and more; RSVP reading, folder scanning; TTF and OTF fonts; Google Drive sync in PRO variant ([AlternativeTo](https://alternativeto.net/software/librera-reader/about), [F-Droid mirror](https://apt.izzysoft.de/fdroid/index/apk/com.foobnix.pro.pdf.reader?repo=main)).
- **Lithium**: EPUB only, Material Design, ad-free; night and sepia themes; page or scroll; highlights and export free; Pro adds custom themes and Google Drive sync of position/highlights/notes (books not synced) ([APKMirror](https://www.apkmirror.com/apk/faultexception/lithium-epub-reader/); last release listed Jan 2025).

## 2. Feature matrix (15 features)

Legend: Y = yes, P = partial/limited, N = no, ? = not verified. Based on the sources above; "?" is common because several vendors do not document details.

| Feature | Apple Books | Kindle | Kobo | Play Books | Readwise Reader | Readest | Koodo | Thorium | Foliate | KOReader | Calibre viewer | Kavita | Booklore |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 Paged and scroll modes | Y | Y | Y | Y | P (paged scroll) | Y | Y | Y | Y | Y | Y | Y | ? |
| 2 Two-column / spread | ? | ? | ? | ? | N | Y (also parallel read) | Y | ? | ? | ? | ? | Y | ? |
| 3 Page-turn animation choice | Y (curl/fade/scroll) | P | Y | ? | ? | ? | ? | ? | ? | N | ? | ? | ? |
| 4 Font family + size | Y | Y | Y | Y | P | Y | Y | Y | Y | Y | P (size confirmed) | Y | Y |
| 5 Custom fonts/CSS | N | N | N | N | P | Y (CSS) | ? | ? | ? | Y | Y (CSS) | Y (fonts) | ? |
| 6 Margins, line height, justification | Y | P | Y | ? | ? | Y | ? | Y | Y | Y | Y | P (size, spacing, margin) | ? |
| 7 Hyphenation control | ? | ? | ? | ? | ? | ? | ? | ? | ? | Y | ? | ? | ? |
| 8 Publisher styles on/off | ? | ? | ? | ? | Y (original styles) | ? | ? | ? | ? | Y (style tweaks) | Y (user stylesheet) | ? | ? |
| 9 Themes (light/sepia/dark/custom) | Y | Y | P (tone) | Y | P (dark) | Y | Y | Y | Y | Y | Y | Y (4 themes) | ? |
| 10 Contents + progress + time left | Y | Y | Y | Y | ? | Y | Y | ? | Y (slider w/ chapter marks) | Y | Y (time left) | Y | ? |
| 11 Highlights, notes, bookmarks | Y | Y | Y | Y | Y | Y | Y | P (bookmarks) | Y | Y | Y | Y | P |
| 12 Annotation export | P | P | P | ? | Y (Readwise) | Y (Readwise, text) | Y (Notion, Readwise) | ? | ? | Y (many formats) | ? | Y | ? |
| 13 Dictionary / Wikipedia / translate | Y (dictionary) | Y (all three) | Y | ? | Y (AI define) | Y (all three) | P (translate) | ? | P (dictionary) | Y (dictionary + Wikipedia) | Y (customisable) | ? | ? |
| 14 Read-aloud (TTS) | Y (system) | P | ? | Y | Y (AI voices) | Y | Y | Y | Y | ? | Y | ? | ? |
| 15 Cross-device sync of position + annotations | Y (iCloud) | Y (Whispersync) | Y | Y (PDF annotations only after Jan 2026) | Y | Y (account, KOReader) | Y | ? | ? | P (position via kosync) | P (via Content server) | Y (position) | P (see notes) |

Library side (not in the 15 but relevant): Calibre/OPDS/folder import: Readest (OPDS+Calibre), Koodo (batch import, cloud/WebDAV), Foliate (OPDS), KOReader (OPDS, Calibre wireless), Kavita/Komga/Booklore/Calibre-Web (OPDS server). Metadata editing: Calibre, Calibre-Web, Booklore (fetch from sources). Collections: Apple Books collections, Booklore Magic Shelves, Kavita reading lists.

## 3. What makes reading pleasant (patterns most praised)

Caveat: direct Reddit/HN/MobileRead threads were hard to retrieve; patterns are drawn from reviews, comparison articles and community snippets, each cited.

1. **Reliable position sync that survives device switching.** The most cited cross-app expectation, and the first thing noticed when it fails ([Unstar](https://unstar.app/blog/kindle-apple-books-kobo-libby-scribd-ereader-apps-ranked-2026); Readest user on r/macapps: not being able to resume on the phone is "a deal breaker" ([thread](https://reddit.birdcat.cafe/r/macapps/comments/1iyv958/introducing_readest_a_free_and_modern_ebook/mthni7b/?context=3))).
2. **Deep typography control, including your own fonts and hyphenation.** KOReader, justRead and Hyphen reviews and listings stress margins, line spacing, hyphenation dictionaries, custom fonts ([ITNext](https://itnext.io/the-customizable-epub-reader-for-iphone-i-wanted-5c966b4eaecc), [KOReader guide](https://koreader.rocks/user_guide/)).
3. **Per-book settings and profiles** (KOReader) and different margins for portrait/landscape (justRead) ([ITNext](https://itnext.io/the-customizable-epub-reader-for-iphone-i-wanted-5c966b4eaecc)).
4. **Fast, responsive page turns.** HN commenter: KOReader turns pages faster than the stock Kobo reader ([HN](https://news.ycombinator.com/item?id=41859047), via search summary).
5. **Quick lookup in the reading flow** (Kindle dictionary praised; Kobo dictionary/translation praised) ([Unstar](https://unstar.app/blog/kindle-apple-books-kobo-libby-scribd-ereader-apps-ranked-2026)). Select-text tooltip with dictionary/Wikipedia/translate/TTS is Readest's pattern ([It's FOSS](https://itsfoss.com/news/readest-app/)).
6. **Clear progress feedback: chapter marks on the progress bar, time left in chapter/book.** Missing time-left is a named reviewer gap in BookFusion; chapter progress praised in Moon+ ([App Store reviews via search](https://apps.apple.com/ca/app/bookfusion/id1141834096)); Foliate and Calibre provide it ([Flathub](https://flathub.org/apps/com.github.johnfactotum.Foliate), [Calibre manual](https://manual.calibre-ebook.com/viewer.html)).
7. **Reliable, portable annotations: export to Readwise/Markdown/Notion.** KOReader and Readest are praised for it; locked export is a complaint elsewhere ([KOReader guide](https://koreader.rocks/user_guide/), [App Store Readest](https://apps.apple.com/us/app/id6738622779)).
8. **Clean, uncluttered library and home screen with no store promotion.** Kobo and Apple Books are praised for clean UI; Kindle criticised for recommendations ([Unstar](https://unstar.app/blog/kindle-apple-books-kobo-libby-scribd-ereader-apps-ranked-2026), [UX Collective](https://uxdesign.cc/things-that-really-bug-me-about-the-kindle-app-a-ux-review-582b210e11cd), search summary).
9. **Choice of page-turn style, including a tasteful animation or none.** Apple Books restored curl after backlash; other users ask to disable animation ([Apple forum](https://discussions.apple.com/thread/254383161), [tiReader review](https://apps.apple.com/us/app/tireader-ebook-reader/id1276508285)).
10. **Bring-your-own-books freedom and open sync (OPDS, WebDAV, KOReader sync, Calibre).** Self-hosters value being able to sync a Kobo/KOReader library with their own server ([HN](https://news.ycombinator.com/item?id=41859047), [Komga docs](https://komga.org/docs/guides/koreader), [Readest wiki](https://github.com/readest/readest/wiki/Sync-with-Koreader-devices)). Also: ad-free, no-account apps like ReadEra ([comparison](https://androidayuda.com/aplicaciones/listas/librera-vs-moon-reader-vs-readera-la-comparativa-definitiva-para-leer-en-android/)).

Honourable mentions: distraction-free environment ([Six Colors](https://sixcolors.com/post/2019/08/the-kindle-is-fine-it-couldve-been-much-better-than-that/)), reading ruler / parallel read ([Readest](https://github.com/readest/readest)), social "popular highlights" (Kindle, opt-out available, which suggests it divides readers).

## 4. What people hate (complaints)

1. **Position lost or jumping on sync** (Kindle jumps 20-50 pages; Apple Books occasionally resets; PocketBook sync called "terrible") ([Unstar](https://unstar.app/blog/kindle-apple-books-kobo-libby-scribd-ereader-apps-ranked-2026), [PocketBook App Store](https://apps.apple.com/us/app/id805488884)).
2. **Locked, fixed typography** on mainstream apps (Kindle on iPhone: fixed fonts/spacing/themes; no custom fonts in Yomu) ([ITNext](https://itnext.io/the-customizable-epub-reader-for-iphone-i-wanted-5c966b4eaecc)).
3. **Annotation export locked or awkward** (Kindle, Apple Books, Kobo mobile) ([Unstar](https://unstar.app/blog/kindle-apple-books-kobo-libby-scribd-ereader-apps-ranked-2026)).
4. **Store-driven clutter and recommendations** in the reading app ([UX Collective](https://uxdesign.cc/things-that-really-bug-me-about-the-kindle-app-a-ux-review-582b210e11cd)).
5. **Sideloaded books are second-class** (no X-Ray on Kindle; Kobo does not sync sideloaded files; Play Books rejects some EPUB 3 and DRM'd files) ([Good e-Reader](https://goodereader.com/blog/?p=263641), [The eBook Reader](https://blog.the-ebook-reader.com/2026/03/11/list-of-the-main-flaws-for-each-of-the-top-ereader-brands), [Leanpub](https://help.leanpub.com/en/articles/7940096-i-m-trying-to-upload-a-leanpub-book-to-google-play-and-it-s-not-working-what-can-i-do)).
6. **Platform lock-in and removal of features** (Amazon removed Download & Transfer via USB on 26 Feb 2025; mandatory updates remove features) ([TechRadar](https://techradar.com/tablets/ereaders/amazon-just-killed-a-useful-kindle-usb-feature-leaving-me-stuck-with-less-flexibility-for-ebook-downloads-and-backups), [The eBook Reader](https://blog.the-ebook-reader.com/2026/03/11/list-of-the-main-flaws-for-each-of-the-top-ereader-brands)).
7. **Page-turn/mode settings that revert or disappear** (Apple Books stuck in scroll mode; Mac missing scroll option; unwanted animation removed or forced) ([Apple forum](https://discussions-jp-prz.apple.com/thread/255467460), [Apple forum](https://discussions.apple.com/thread/254383161)).
8. **Steep learning curve and odd UI in powerful readers** (KOReader "notepad++/vim level", Calibre UI) ([r/macapps thread](https://reddit.birdcat.cafe/r/macapps/comments/1iyv958/introducing_readest_a_free_and_modern_ebook/mthni7b/?context=3)).
9. **Missing basics in smaller apps: time left, finished marker, TTS pause control** ([BookFusion review](https://apps.apple.com/ca/app/bookfusion/id1141834096), Readest reviews on [App Store](https://apps.apple.com/us/app/id6738622779)).
10. **Slowness and size limits** (PocketBook slow menus on large books; BookFusion 35 MB upload cap per user; Readwise formerly loaded the whole EPUB into memory) ([The eBook Reader](https://blog.the-ebook-reader.com/2026/03/11/list-of-the-main-flaws-for-each-of-the-top-ereader-brands), [Readwise](https://apps.apple.com/app/id1567599761)).

Also seen: inconsistent page numbers across apps (book clubs, citations) ([Unstar](https://unstar.app/blog/kindle-apple-books-kobo-libby-scribd-ereader-apps-ranked-2026)); self-hosted sync half-working (Booklore KOReader bookmarks/highlights, Komga chapter-granularity progress) ([Gigazine](https://gigazine.net/news/20260215-booklore), [Komga](https://komga.org/docs/guides/koreader)).

## 5. Products to study most closely for Bookeeper

1. **Readest.** Same Tauri family, same platforms (Win/macOS/Linux/Android/iOS/web), fully open source. Selection tooltip (dictionary, Wikipedia, translate, TTS, highlight), KOReader/OPDS/Calibre integration, account sync of files and progress. Closest feature target; study what is unfinished (reviews say v0.x).
2. **KOReader.** The benchmark for typography, per-book settings, statistics, and for an open sync protocol (kosync) that a Bookeeper server could implement as a bonus. Study its settings model, and the cost of its learning curve to avoid.
3. **Kavita.** Self-hosted server plus web/PWA reader; four clear themes, annotation colour slots, estimated time left, resume on another device, OPDS, multi-user. Closest to Bookeeper's "optional server + PWA phone" shape.
4. **Apple Books (with Kobo as a runner-up).** Reference for a calm, uncluttered reading UI, page-turn style choice, collections, reading goals, and a clear way to bring your own EPUB/PDF. Kobo for the clean per-book settings sheet and reading stats.
5. **Kindle (Whispersync, X-Ray, Popular Highlights) and Readwise Reader as a contrast pair.** Kindle for sync of position and annotations across everything and in-flow lookup; Readwise for highlight-centric workflows (export, review, assistant). Bookeeper's twist: family members sharing one library, so per-person progress, shared highlights opt-in, and per-person settings. Calibre viewer is a close sixth for its search modes and library-wide highlight browser.

Bookeeper already has per-person reading status and current page, shelves, loans, wishlist; the reader should write progress into that record rather than create a parallel system. Booklore's per-user progress and Magic Shelves are the nearest self-hosted analogue (check project state first).

## 6. DRM notes (facts only)

- **Kindle** uses Amazon's proprietary DRM tied to an Amazon account; third-party readers cannot open it; Adobe DRM is not supported by Kindle ([Eden](https://about.eden.co.uk/resources/what-is-drm-for-ebooks-publishers-guide), [eBooks.com help](https://support.ebooks.com/hc/en-gb/articles/214119286)). Amazon ended "Download & Transfer via USB" on 26 Feb 2025; Wi-Fi delivery and sideloading of DRM-free files via USB still work ([TechRadar](https://techradar.com/tablets/ereaders/amazon-just-killed-a-useful-kindle-usb-feature-leaving-me-stuck-with-less-flexibility-for-ebook-downloads-and-backups), [Cloudwards](https://www.cloudwards.net/news/amazon-removes-usb-download-transfer-kindle-books)).
- **Apple Books** purchases use Apple's FairPlay (historical source only; no current page found, [Computerworld 2010](https://www.computerworld.com/article/1437621/apple-disses-our-drm-for-ipad-adobe-says.html)); DRM-free EPUB/PDF open without issue ([Unstar](https://unstar.app/blog/kindle-apple-books-kobo-libby-scribd-ereader-apps-ranked-2026)).
- **Adobe ADEPT** is used by Kobo, Nook, many other stores and library lending; read with Adobe Digital Editions or supporting devices/apps ([eBooks.com help](https://support.ebooks.com/hc/en-gb/articles/214119286)). Kobo is reported to be moving from Adobe DRM to Readium LCP; whether this has shipped is not verified ([Good e-Reader](https://goodereader.com/blog/digital-publishing/netgalley-switches-from-adobe-digital-editions-to-lcp), [Eden](https://about.eden.co.uk/resources/readium-lcp-replacing-adobe-drm-publishers)).
- **Readium LCP** is an open standard from EDRLab; any reading system can implement it. Thorium Reader reads LCP-protected EPUB, PDF, audiobooks, comics; some stores (e.g. BOOK WALKER) list third-party apps with LCP support ([EDRLab](https://www.edrlab.org/software/thorium-reader/), [BOOK WALKER](https://support.bookwalker.com/faq/third-party-apps-with-lcp-support/)).
- **Google Play Books**: uploaded DRM'd files stay stuck in processing ([Digital Trends via search summary](https://digitaltrends.com/?p=442794), [Google help](https://support.google.com/googleplay/answer/11012086?hl=en)); store purchases with Google's own protection open only in Play Books.
- **Open-source readers** (Readest, Koodo, Foliate, KOReader, Calibre viewer, Kavita, Komga, Booklore, Calibre-Web) open DRM-free files; Thorium is the notable open-source reader that also handles LCP. Readest, Koodo and Kavita list no DRM support in the sources found; not verified individually beyond that. Onyx Boox's native app lacks DRM support, so users rely on store apps ([The eBook Reader](https://blog.the-ebook-reader.com/2026/03/11/list-of-the-main-flaws-for-each-of-the-top-ereader-brands)).
- Implication for Bookeeper: scope the managed-file library to DRM-free files (EPUB, PDF, CBZ, etc.) and consider LCP only as a later optional item; records for DRM'd store purchases stay metadata-only, as today.

## 7. Gaps and caveats

- Few direct Reddit/HN/MobileRead threads were retrievable; "praise" and "hate" lean on reviews, roundups and snippets. Rankings of frequency are judgement, not counts.
- Not verified: Koodo/Thorium/Foliate sync, Booklore reader settings, Komga EPUB reader depth, Play Books typography, Moon+ current feature list, ReadEra TTS on Android, Apple Books detailed settings (official pages were only a TOC).
- App-store text and vendor pages change; check before quoting.
