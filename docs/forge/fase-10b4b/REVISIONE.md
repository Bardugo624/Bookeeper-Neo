# Terza revisione finale del lettore

Revisione finale di Impeccable sulla build integrata in 3cefee6 (fino alla 10B4). Le catture citate non sono nel repository: stanno in `/home/user/Bookeeper-Neo/.impeccable/review/lettore/`; le immagini del sito in `/tmp/claude-0/-home-user-Bookeeper-Neo/5c25497d-ca48-5b0d-b840-16b1fadf3fec/scratchpad/site-shots/`. Il rapporto segue invariato.

disposition: fix

I opened all 31 captures in `/home/user/Bookeeper-Neo/.impeccable/review/lettore/` and are valid: 1280×800 or 390×844, each showing what its name says. I also opened 4 of the 8 site shots: desktop-reader-light, desktop-reader-notes-dark, phone-reader-light and phone-reader-notes-dark. Not read this round: sketches 01–09, the full spec (I only grepped it), DESIGN.md and PRODUCT.md (I didn't open them again), and the four other site shots. The phone version of the error state and the «Vedi tutti (12)» case have no capture.

Only fix 1 below blocks the ship. Fixes 2 to 6 can wait for the hotfix.

## persistence
Pass.
- This is a code-led build: there is no state.json and no comp round.
- FORM still carries `seed: seed:ef54b41f3ca44735`, which the first review confirmed with `--check-seed`.
- The approval is on record: «Pannello compagno» and «Approvo, parti».
- I did not open PRODUCT.md or DESIGN.md again; they existed at the second review.

## fidelity
**The second review's eight fixes**
1. **Error states: resolved.** desktop-15 and desktop-16 show only «Indietro» and the title, with no bottom bar and no line. The phone error state has no capture, so it is unverified.
2. **iPhone install sheet: partial** (mobile-03).
   - «Ho capito» is now full height.
   - The icon and the bold name now stay together, but that pair wraps as one block, so «Scegli» sits alone on line 1.
   - The title is still three lines; the sketch has two.
3. **Note percents: resolved.** «Capitolo 1 · 0,1%» in desktop-07 and mobile-07; «I · 1,7%» in the site shots.
4. **Article before the percent: resolved where captured.** «Torna allo 0%» (desktop-12, desktop-13), «Torna al 100%» (desktop-08-cerca-scelto), «Vai al 45%» (desktop-11). The «all'» cases have no capture.
5. **Relative time: resolved for «adesso»** (desktop-11). «alle …» and «ieri alle …» have no capture.
6. **Search marks: resolved.** There are no marks on the page in desktop-09 or desktop-10-*. It goes further than the contract asked, though: see fix 4 below.
7. **Grid ring: resolved.** desktop-01 shows an empty ring with the cover visible through it.
8. **«Tutti i 1»: resolved.** The link is gone in desktop-01 and mobile-01. «Vedi tutti (12)» has no capture.

The time left, which the owner asked for, is now shown: «· 12 min alla fine del capitolo · 36 h 44 min al libro» on the computer (desktop-03), «· 6 min» / «· 12 min» on the phone (mobile-05, mobile-04).

One thing is unverified, not a fix: at about the same 0% of the same book, desktop-03 says «36 h 44 min al libro» and desktop-08/09 say «8 h 24 min». `model/speed.ts` keeps learning from any page held for 2 seconds or more, so the capture script probably changed the speed between shots.

**Your observations**
- **Font choice doesn't reach inner elements: confirmed, and it blocks the ship.**
  - In `frame/bookCss.ts`, with «Stili dell'editore» on, the chosen font goes only on `body`, without `!important`. The rule that makes every element inherit the font exists only when the publisher's styles are off.
  - So the book's `.testi { font-family: Georgia… }` wins. With «Lora» chosen, desktop-reader-light/dark and phone-reader-light render a Times-like system serif, not the Lora seen in desktop-03.
  - The «Carattere» control does nothing on these books, and «Stili dell'editore» is on by default.
- **«Editore» fallback only looks at `body`: confirmed.**
  - `applyFallbackFont` checks only `body`'s computed family, and only when that family is generic.
  - A family the publisher names on an inner element but the device lacks falls to the system serif. Georgia is missing on Android too, which is the PWA's phone.
  - This breaks the contract's «se manca, Lora», but the result is still a readable serif. It can wait.
- **No space before «·»: confirmed** in desktop-03 through desktop-14, mobile-04/05/06 and every site shot.
  - The source has `{' · '}` in `ui/view/BottomBar.tsx` lines 58 and 60, but each `<span>` is a flex item, and the browser drops the leading space at the start of a flex item.
- **Leaving search clears the query: confirmed, and I reject it as a design choice.** The 10B4 contract says leaving search removes the marks, not the search. Losing a search of 2,687 hits on a long book just because you looked at the Notes tab is a step backwards.

**Matches.** These still hold:
- topology and chrome hiding (desktop-03 and desktop-04);
- the «Continua da …» bar (desktop-11);
- the end-of-book bar (desktop-14);
- the selection toolbar and the amber highlight (desktop-05, desktop-06);
- the themed overlays on Seppia and Scuro (desktop-10-*);
- the phone chrome, sheet, Aspetto and menu (mobile-04, mobile-06, mobile-07, mobile-08, mobile-09);
- the offline state (mobile-11);
- the saved state, «✓ Sul telefono · 2,4 MB», «Togli dal telefono» and «EPUB» alone (mobile-12), which matches the 10B3 rule and closes the gap the second review left open.

**Contradicted**
- The font choice with the publisher's styles on (above).
- «100%» while «3 min al libro» remain (desktop-07): the percent rounds up to 100 before the end.

## ceiling
- **Drop-cap image cut off from its word.** In two-page mode with a real book, the floated «Q» initial image moves to the top of the right page while «uel ramo del lago di Como» starts at the bottom of the left page (desktop-reader-light/dark). The phone gets it right (phone-reader-light). Don't use the desktop site shots for the homepage until this is fixed or the frame is re-chosen.
- **Engravings in dark themes.** On Scuro, engravings show as full-white blocks (desktop-reader-notes-dark). Slightly dimming images in the Scuro and Nero themes would keep the dark page calm.

## material_fixes
1. **The font choice must reach the whole book. BLOCKS THE SHIP.**
   - File: `/home/user/Bookeeper-Neo/packages/reader/src/frame/bookCss.ts`.
   - Seen in: desktop-reader-light, desktop-reader-notes-dark and phone-reader-light (Lora chosen, system serif shown).
   - Target: when `font !== 'publisher'`, set the family on `body` with `!important`, and add `body *:not(img):not(svg):not(video):not(code):not(pre):not(kbd):not(samp):not(tt) { font-family: inherit !important; }` with the publisher's styles on as well as off. Leave the publisher's other rules alone.
   - Add a test fixture with `.testi { font-family: Georgia, serif }`.
2. **No space before «·» in the bottom bar. Can wait for the hotfix,** but it is a one-line change: fold it into the blocking round, and retake any homepage shots after it.
   - File: `/home/user/Bookeeper-Neo/packages/reader/src/ui/view/BottomBar.tsx`, lines 58 and 60.
   - Seen in: desktop-03 («0%· 12 min…· 36 h 44 min…»), mobile-05 («0%· 6 min») and the site shots.
   - Target: «0% · 12 min alla fine del capitolo · 36 h 44 min al libro». Either render the separator as its own element with inline margin, or use `' · '`.
3. **«Editore» falls to the system serif instead of Lora. Can wait for the hotfix.**
   - File: `/home/user/Bookeeper-Neo/packages/reader/src/frame/fallbackFont.ts`.
   - Seen in: the site shots with «Editore» on this machine, where `.testi` names Georgia and the device lacks it.
   - Target: check the computed family of the text containers (`p` and their closest styled ancestors), not only `body`. When none of the named, non-generic families is available (`doc.fonts.check`) and the book ships no `@font-face` for them, give those elements Lora, as the contract's «se manca, Lora» says.
4. **Leaving search clears the query and the results. Can wait for the hotfix.**
   - File: `/home/user/Bookeeper-Neo/packages/reader/src/ui/panel/SearchTab.tsx`.
   - Seen in: the 10B4 behaviour you reported. The contract only removes the marks.
   - Target: keep the query, the results and the scroll position while the book stays open. Closing the panel or switching tab removes only the page marks, and coming back to Cerca with a query puts them back. Only clearing the field throws the search away.
5. **iPhone install sheet, still partial. Can wait for the hotfix.**
   - File: `/home/user/Bookeeper-Neo/apps/mobile/src/modules/reader/InstallSheet.tsx` and its CSS.
   - Seen in: mobile-03, where «Scegli» sits alone on line 1 and the title runs to three lines.
   - Target: keep only the icon and the first word together («[+] **Aggiungi**») and let the rest of the bold name wrap, so line 1 reads «Scegli [+] Aggiungi alla». Fit the title on two lines, as in sketch 08 (centre).
6. **«100%» before the end of the book. Can wait for the hotfix.**
   - File: `/home/user/Bookeeper-Neo/packages/reader/src/ui/view/format.ts` (formatPercent).
   - Seen in: desktop-07, which reads «100% · 3 min al libro».
   - Target: round down at the top, so the percent never reads 100% until the last page is reached («99%» or «99,x%»).

## keep
Keep:
- the bare page with only the 2 px track;
- the themed overlays;
- the outline-chosen / underline-others search marks;
- «Torna allo 0%» and «adesso»;
- the saved state on the phone, «✓ Sul telefono · 2,4 MB» with «Togli dal telefono».

Fix 1 must not touch the publisher's layout rules, only the family.
