---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: []
---

# Homepage www.neokeeper.dev

Scope: the public homepage of Bookeeper, static, in `apps/site/`. Visitor mode: Persuade.

Audience: people with a home library (often a family) who have never heard of Bookeeper; the family member who runs a small server.
Job: understand what Bookeeper is, believe the library stays theirs, download the right installer.
Action: download the installer for the visitor's own system (detected), or read how to put the library on a server and a phone.
Proof: real app screenshots on a labelled demo library; the "Dov'è?" mechanism demonstrated on an example house; real release files.
Constraints: Italian and English; voice colto e accogliente; no hand-written versions (downloads come from GitHub releases now, from `updates.neokeeper.dev/v2/downloads/stable.json` later); no owner personal data; hosted on the VPS with Caddy only after the owner's go-ahead.

## Direction contract

THESIS: Bookeeper's homepage answers «Dov'è?» before it says anything else: the house, drawn as an architect's plan, finds a book down to its shelf. It refuses the category default of headline, button and a floating screenshot over a row of feature cards.

OWN-WORLD: An architect's drawing set for a family house, inked in Bookeeper sage. Dark scheme: deep sage ground (primary 900/950) with pale sage linework; light scheme: pale sage drafting paper (primary 50/100), deep sage ink, never cream. Amber (#c9954a, a shelf wood) is the only "found" mark. Plan, elevation and section views; dimension lines, room labels in small caps Inter, titles in Lora. Furniture woods (salvia, terracotta, notte, prugna, ambra, grafite) appear only as furniture and spines.

STORY: The visitor sees a book found in a house, understands Bookeeper catalogues where every book lives, sees the real app doing it, learns the library stays on their computer or their own server, sees the phone and server path in three steps, and downloads.

FIRST VIEWPORT: Left column (about 40%): small wordmark and nav, Lora headline «Dov'è?» answered in place, one sentence, the primary download button for the detected system with "altre piattaforme" beside it. Right (about 60%): the floor plan of an example house, full height, a title search chip above it; the found furniture glows amber with a leader line to a label naming room, furniture and shelf.

FORM: Pianta di casa, my ranked list position 1 (IMPECCABLE'S PICK chosen over the roll), seed:8751ac720eb65a40. Signature interaction: pick a title, the plan routes from the door to the room, the furniture and then the shelf, which opens into an elevation with the spine lit. Motion grammar: a drawn line (stroke-dashoffset), once per answer.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- Exact format of `stable.json` (adapter documented in the site README).
- Caddy site block for www.neokeeper.dev: proposed, applied only on the owner's go-ahead.
