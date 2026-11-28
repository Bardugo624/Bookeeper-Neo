# Seconda revisione finale del lettore

Revisione finale di Impeccable sulla build integrata in 4d960f6 (10B, 10B1, 10B2, 10B3), contro il contratto di direzione (`apps/desktop/.impeccable/surfaces/src-modules-reader-readerview-tsx.md`), gli schizzi approvati (`docs/superpowers/specs/2026-11-28-lettore/`) e la prima revisione (`docs/forge/fase-10b2/REVISIONE.md`). Le catture citate non sono nel repository: stanno in `/home/user/Bookeeper-Neo/.impeccable/review/lettore/`. Il rapporto segue invariato.

disposition: fix

Not read: sketches 01, 04, 06 and 09, compagno.html, the full text of the spec, DESIGN.md and PRODUCT.md (I only grepped them and checked they exist), and most of the artifact source (I only grepped it to locate files). I opened all 30 captures. Every one is valid: 1280×800 and 390×844, and each shows what its file name claims.

## persistence
Pass.
- PRODUCT.md and DESIGN.md exist. This is a code-led build, so it has no state.json and no comp round. The files under `mocks/decision/` are exempt.
- The approval is on record: the surface brief's FORM names «Pannello compagno», and the packet quotes «Approvo, parti».
- FORM carries `seed: seed:ef54b41f3ca44735`. The first review confirmed it with `--check-seed` (exit 0), and the line is unchanged.

## fidelity
**The first review's eight fixes**
- **Fix 1, overlays take the theme: resolved.**
  - The popover is dark on Scuro and Nero and sepia on Seppia (desktop-10-*).
  - On the phone the chips are bordered, «Tutte · 2» is accent-filled, the tabs sit on a track, and «Esporta in Markdown» is a bordered button (mobile-07 vs sketch 07, right).
- **Fix 2, Lora fallback: resolved.** Every capture renders Lora.
- **Fix 3, phone Appearance rows: resolved.** mobile-08 uses the compact layout of sketch 08: Interlinea and Margini share a row with S/M/L, and everything through Ripristina is visible.
- **Fix 4, thin line: resolved.**
  - Desktop: rows 798–799 are a full-width track (#EBE7E0) with the fill on top (desktop-04).
  - Phone: rows 834–835 hold a track inset 16 px, as in sketch 07 left (mobile-05). mobile-10 shows the fill against it.
- **Fix 5, search marks: resolved.** In desktop-08-cerca-scelto only the chosen «lento» is outlined, with clearance around the glyphs, and the other hits are underlined.
- **Fix 6, offline control on the phone: resolved.** «Scarica per leggere offline» sits under «Leggi», with «EPUB · 2,4 MB» below it (mobile-02). The 10B3 rule for the saved state («EPUB» alone) has no capture and is unverified.
- **Fix 7, iPhone install steps: partial** (mobile-03 vs sketch 08, centre).
  - Done: the icons are inline and the action names are bold.
  - Still wrong:
    - Step 2's add icon wraps alone onto the next line.
    - The title runs to three lines, leaving «Home» alone on the last one. The sketch has two lines.
    - «Ho capito» is shorter and lighter than in the sketch.
- **Fix 8, sheet inset and trimmed quotes: resolved.** Content aligns with the title at x=24, the chips fit on one row, and the quotes are trimmed (mobile-07).
- **Ceiling note on search percents: partial.** The one-decimal rule ships. Every chapter-1 hit still reads «0,0%» (desktop-08), because a 200-chapter book's first pages sit below 0.05%.

**Matches**
- Topology and chrome hiding on the computer (desktop-03 and desktop-04 vs 01).
- The «Continua da …» bar: device icon, bold question, «Resta qui» and a filled «Vai al 45%» (desktop-11 vs 05).
- After «Vai al 45%» the bar offers the return jump (desktop-12, spec line 160).
- The end-of-book question (desktop-14).
- The selection toolbar with 4 dots, Nota, Copia and Cerca sul web, plus the system-blue selection (desktop-05 vs 03).
- The amber highlight veil (desktop-06).
- Phone chrome, bar and tabs (mobile-04, mobile-06, mobile-09 vs 07).
- The offline state names the problem and the recovery (mobile-11).
- Error copy follows the spec lines 56–57 (desktop-15, desktop-16).

**Acceptable adaptations**
- The text size is a − / + stepper. Cited by spec line 127.
- The phone selection toolbar is icons only. At 390 px there is no width for the labels.
- The bottom bar shows no time left in any capture. Cited by spec line 295 («dopo qualche minuto»), but no capture has ever shown it. This promise from the owner's request is unevidenced, not passed.

**Contradicted**
- Sketch 05 dates the phone position «ieri alle 22:40». The build reads «· questo minuto» (desktop-11). That is `Intl.RelativeTimeFormat` output with numeric 'auto', and it is not natural Italian.
- Sketch 02 and 07 (right) show «1%», «2%», «3%» on notes. The build's note near the start of a long book reads «Capitolo 1 · 0%» (desktop-07, mobile-07). Your observation is confirmed: notes do not use `formatPercent`.
- Install sheet: see fix 7 above.

**Your other observations**
- «Torna al 0%» (desktop-12): confirmed. The strings «Torna al {percent}%» and «Vai al {percent}%» in `packages/i18n/src/locales/it/reader.json` (keys jump_back and go) take no article agreement.
- Error states (desktop-15, desktop-16): confirmed. Cerca, Segnalibro, Aspetto and Pannello are still live, and a 0% track sits at the bottom, with no book open.
- mobile-03 step 2's icon wrapping alone: confirmed.

**Added without approval / new defects**
- Search marks stay on the page after search is left. «lento» is still underlined in desktop-09 and desktop-10-* with the panel closed, which breaks the bare-page promise.
- «Tutti i 1» is ungrammatical (desktop-01, mobile-01).
- The 0% ring on the grid cover is still a white disc inside a grey ring (desktop-01; the pixels at the centre are 255,255,255). The 10B3 contract says «un anello vuoto e non un disco bianco». The list rows on the phone (mobile-01) and the book page (desktop-02) render the ring correctly.

## ceiling
- Search positions within a chapter still read «0,0%» for every early hit (desktop-08). Decimal percents cannot tell apart hits on the same pages. For hits that share a tenth, show a page or position within the chapter, or leave the percent out.
- The phone's «Sei offline» banner uses a plain wifi glyph, not a wifi-off one (mobile-11). This is the app's global banner, outside the reader's scope.

## material_fixes
1. **Error states keep live reading tools** (desktop-15, desktop-16).
   - Problem: Cerca, Segnalibro, Aspetto, Pannello and a 0% progress track show with no book loaded.
   - Files: `packages/reader/src/ui/view/Reader.tsx`, and the error branch that renders «Il file manca sul server» / «Questo file non si apre» in `packages/reader/src/app`.
   - Target: in an error state the top bar keeps only «Indietro» and the title, and the bottom bar is not rendered.
2. **iPhone install sheet** (mobile-03 vs sketch 08, centre).
   - Problem: step 2's add icon wraps alone onto the next line, the title runs to three lines with «Home» alone on the last, and «Ho capito» is undersized.
   - Files: `apps/mobile/src/modules/reader/InstallSheet.tsx` and its CSS.
   - Target:
     - Put the icon before the bold name, inside a no-wrap span with it: «Scegli [+] **Aggiungi alla schermata Home**.»
     - Balance the title onto two lines (`text-wrap: balance`, or the sketch's sans title).
     - Give «Ho capito» the sketch's full-height primary size.
3. **Notes round to «0%»** (desktop-07, mobile-07).
   - File: `packages/reader/src/ui/panel/NotesList.tsx`, the «Capitolo · N%» meta line.
   - Target: format the position with `formatPercent` from `ui/view/format.ts`, as TocList and SearchTab do, so it reads «0,1%», matching the small percents of sketch 02.
4. **Wrong article before the percent** (desktop-12: «Torna al 0%»).
   - Files: `packages/i18n/src/locales/it/reader.json` (jump_back, go), plus a helper in `packages/reader/src/ui/view/format.ts`.
   - Target: «allo 0%» / «allo 0,4%», «all'1%», «all'8%», «all'11%», «all'80%»–«all'89%», and «al» for every other value, such as «al 45%» or «al 100%». Apply it to both «Torna» and «Vai».
5. **«questo minuto»** (desktop-11 vs sketch 05).
   - File: `packages/reader/src/app/helpers.ts`, the relative-time formatter.
   - Target: «adesso» for under a minute, «alle 15:49» for today, «ieri alle 22:40» for yesterday, as in the sketch.
6. **Search marks persist after leaving search** (desktop-09, desktop-10-tema-*).
   - Problem: «lento» stays underlined on the page with the search panel closed.
   - Files: `packages/reader/src/frame/boot.ts` (the search marks), `packages/reader/src/ui/panel/SearchTab.tsx`.
   - Target: clear the overlay marks when the Cerca tab or panel closes or the query is cleared, so immersive reading shows only the page and the line.
7. **Grid ring still a white disc at 0%** (desktop-01).
   - File: `packages/ui/src/book/ProgressRing.module.css`.
   - Target: drop the white inner fill, so a 0% book shows an empty `--bk-border-strong` ring, as the 10B3 contract says and as the phone list row already does (mobile-01).
8. **«Tutti i 1»** (desktop-01, mobile-01).
   - Files: `packages/i18n/src/locales/it/reading.json` and `mreading.json` (now.all), plus the rail components in `apps/desktop/src/modules/reading` and the matching mobile rail.
   - Target: hide the link when every book is already shown; otherwise use a plural-safe label such as «Vedi tutti (12)».

Not a code fix, but needed before ship: one capture with a seeded reading speed, showing «· N min alla fine del capitolo · … al libro» on the computer and «· N min» on the phone, as in sketches 02 and 07. Without it, time left (an explicit owner requirement) stays unevidenced.

## keep
Keep the chrome hiding to the bare page and the 2 px track, the themed overlays that now follow Seppia, Scuro and Nero, the Lora fallback, and the outline-chosen / underline-others search marks.
