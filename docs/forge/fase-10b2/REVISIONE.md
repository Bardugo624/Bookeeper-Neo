# Revisione finale della 10B1

Revisione finale di Impeccable sulla build integrata in 152e797, contro il contratto di direzione (`apps/desktop/.impeccable/surfaces/src-modules-reader-readerview-tsx.md`) e gli schizzi approvati (`docs/superpowers/specs/2026-11-28-lettore/`). Le catture citate non sono nel repository: stanno in `/home/user/Bookeeper-Neo/.impeccable/review/lettore/`. Il rapporto segue invariato.

disposition: fix

Unread or only partly read: 05-continua.png, compagno.html, and the full text of DESIGN.md and PRODUCT.md (I checked only that they exist and grepped them). No capture shows «Continua da …», «Torna al 4%», «Segna come letto» at the end of the book, the error states, the note editor or selection on the phone, so those STORY and SIGNATURE promises are unverified, not passed. Every capture opened is valid: 21 PNGs at 1280×800 and 390×844, with content matching their names.

## persistence
Pass.
- PRODUCT.md and DESIGN.md exist. This is a code-led build, so it has no state.json and no comp round. The files under `mocks/decision/` are exempt.
- The approval is on record: the surface brief names «Pannello compagno», and the packet quotes «Approvo, parti».
- FORM carries `seed: seed:ef54b41f3ca44735`. `impeccable concept-seed --check-seed` returned "SEED KNOWN" with exit 0.
- DESIGN.md has no reader section yet. That is the documenter's job after this review, not a finding.

## fidelity
Matrix against the approved sketches. These are a critique reference, so composition counts and pixels do not.

**Matches**
- Topology on the computer: a 52 px top bar (Indietro, title · chapter, four icon buttons), two columns, a bottom bar with chapter ticks, and the companion panel on the right with Indice / Note / Cerca. desktop-03 and desktop-07 match 01 and 02.
- Chrome hides while reading (desktop-04, mobile-05).
- Selection toolbar: 4 dots, Nota, Copia, Cerca sul web, and the system-blue selection the contract asks for (desktop-05).
- Highlight veil in amber (desktop-06). Notes list layout, the «Visibili solo a te» footer and the export button on the computer (desktop-07).
- Search tab: field, «N risultati finora», results grouped by chapter, current result tinted (desktop-08).
- Appearance popover: every row, the toggles, «Vale per tutti i libri su questo computer», Ripristina (desktop-09).
- GROUND: the page is #FBFAF8 warm neutral. Seppia, Scuro and Nero match the families named in OWN-WORLD (desktop-10-*).
- Phone chrome: back, title, Aa, ⋯ at the top; the bar plus Indice, Note, Cerca, Segna at the bottom (mobile-06 matches 07). The sheet opens at 70% (mobile-07). The ⋯ menu has both items (mobile-09). The «In lettura» rail is there (mobile-01, desktop-01 match 09).

**Acceptable adaptations**
- The text size is a − / + stepper, not a slider (spec line 127: «con − e +»).
- Time left is missing from the bottom bar in every capture. That follows the spec's speed rule: the times appear only after 3 measured minutes (`model/speed.ts` MIN_MEASURED_MS). Still unverified.
- «Pannello del libro» is added as the phone sheet's title. This is a reasonable addition but is not in the sketch.

**Contradicted**
- Overlays on a dark theme: the Appearance popover stays white over a Scuro or Nero page (desktop-10-tema-scuro, desktop-10-tema-nero). Sketch 04 has it dark, and OWN-WORLD says «una pagina scura non ha mai una barra bianca».
- Phone notes sheet (mobile-07 vs 07 and 02):
  - the PillTabs have no track;
  - the chips have no borders, and «Tutte · 1» has no accent fill;
  - the chips wrap, leaving the navy dot alone on a second row;
  - «Esporta in Markdown» reads as plain text.
  - I confirm your observation and have found the cause, given under fix 1.
- Thin reading line: there is no track. desktop-04 shows green only at x=0 in rows 798–799. In mobile-05 the bottom rows are a single background colour. Sketches 01 and 07 show a hairline track with the fill on top.
- Search marks: all four hits on the page get the same outline (desktop-08). Spec line 155 and sketch 06: only the chosen hit is outlined, the others are underlined.
- TYPE: every capture renders the browser's default serif. Sketches 01–09 show Lora, and the contract says «se manca, Lora». With the default publisher settings, `frame/bookCss.ts` sets no font-family at all, so a book that has no face falls back to the browser's default font.
- iPhone install sheet (mobile-03 vs 08, centre): the steps lack the Share icon and the Add-to-Home icon, and the action names are not in bold.

**Missing**
- «Scarica per leggere offline» is not under «Leggi» on the phone book page (mobile-02 vs 08, left). Spec line 180 puts it there. It is only in the files section and in the ⋯ menu.
- Impaginazione and the three toggles are not visible in the phone Appearance sheet (mobile-08). They are rendered, but the sheet's 70dvh height cuts off exactly at the edge of a row, after Margini, so nothing hints that it scrolls. Sketch 08 shows them all.

**Your other two observations**
- Text about 10 px from the top on the phone: rejected. The first ink in mobile-05 is at y=55. `ui/view/Reader.module.css` lines 134 and 146 offset the page and bars by `--rd-safe-top` / `env(safe-area-inset-top)`, and `apps/mobile/src/modules/reader/Reader.module.css:10` feeds that variable. The insets cannot be checked in Chromium, but the code path is there.
- The test book's `serif` font: covered by the TYPE row above. The bug is real whatever the test book declares.

## ceiling
- Overlays do not take on the theme's surfaces (see fix 1). This is the one native device the world names that the build leaves unused.
- Search results all read «0%» (desktop-08), because a long book's first chapter rounds to zero. The positions tell the reader nothing. Show one decimal below 10%, as sketch 06 shows 1% / 2%.
- Not in this build's scope: in desktop-01 the grid cover of «I promessi sposi» has an empty white disc at 0%, which reads as a broken badge.

## material_fixes
1. **Overlays lose the theme** (desktop-10-tema-scuro, desktop-10-tema-nero, mobile-07).
   - Cause: `themeVars()` is applied inline on the reader root in `packages/reader/src/ui/view/Reader.tsx:34`. Popover, Sheet and Dialog portal to `body`, so `--rd-rule`, `--rd-raised`, `--rd-accent-soft` and `--rd-ink` are undefined inside them.
   - Files: `packages/ui/src/overlays/Popover.tsx` (accept `style`/`className`, or a portal `container`), `packages/reader/src/ui/view/Sheet.tsx` (apply `themeVars(theme)` plus the page surface to the dialog it already marks), `ui/look/AppearancePanel.tsx`, `ui/look/NoteEditor.tsx`.
   - Target: on Scuro and Nero the popover and sheets use the dark raised surface, as in sketch 04. On the phone the chips are bordered, «Tutte» is accent-filled, the tabs sit on a track, and «Esporta in Markdown» is a bordered button, as in sketches 02 and 07.
2. **No Lora fallback** (every capture vs sketch 01). In `packages/reader/src/frame/bookCss.ts`, with `keepBookFont`, still set the Lora stack on `html` so the book's own rules override it only when they name a face. Also treat a bare generic family (`serif` / `sans-serif`) with no `@font-face` as having no face. Target: Lora unless the book ships a real face.
3. **Hidden rows in the phone Appearance sheet** (mobile-08). In `packages/reader/src/ui/look/AppearancePanel.tsx` and `ui/view/Sheet.css`, open the Appearance sheet tall enough to show every row, or use the compact layout of sketch 08 (Interlinea and Margini on one row, S/M/L). Target: Impaginazione through «Stili dell'editore» visible at 390×844 without scrolling.
4. **Thin line not visible** (desktop-04, mobile-05). In `packages/reader/src/ui/view/Reader.module.css`, make `.line` (and its phone override) a full-width 2 px track in `--rd-rule` with the `--rd-accent-solid` fill on top. Target: a visible line in every state, as in sketches 01 and 07.
5. **Search marks** (desktop-08). In `packages/reader/src/frame/search.ts` / `boot.ts`, draw the chosen hit with `Overlayer.outline`, padded about 2 px so it clears the glyphs, and every other hit with `Overlayer.underline`. Target: sketch 06.
6. **Offline button on the phone book page** (mobile-02). In `apps/mobile/src/modules/search/BookDetailPage.tsx` / `ReadButton.tsx`, put `OfflineControl` (now in `BookFiles.tsx`) directly under «Leggi», with «EPUB · 2,4 MB» below it. Target: sketch 08, left.
7. **iPhone install steps** (mobile-03). In `apps/mobile/src/modules/reader/InstallSheet.tsx`, add the share and add-square icons from the kit set inline in steps 1 and 2, put «Condividi» and «Aggiungi alla schermata Home» in bold, and set «Ho capito» at the kit's normal button size, not the small one. Target: sketch 08, centre.
8. **Doubled inset in the sheet** (mobile-07). Content sits at x=40 under a title at x=24, which also forces the chips to wrap. In `packages/reader/src/ui/panel/CompanionPanel.module.css` and `NotesList.module.css`, drop the 16 px horizontal padding under `[data-variant='sheet']`. Also trim leading and trailing whitespace from the captured highlight text in `app/useSelection.ts`, so quotes read «capitolo … ombr» and not «« capitolo …». Target: content aligned with the title, chips on one row.

## keep
Keep the chrome hiding to the bare page, the computer's companion-panel topology, and the system-blue selection kept apart from the furniture-coloured highlights.
