Implement the RAYDENTEC website from the design handoff in `raydentec-handoff-v2/`.

1. Read `raydentec-handoff-v2/HANDOFF.md` fully, then look at every image in `raydentec-handoff-v2/reference/screens/`. Use `reference/artboards/*.html` when you need an exact pixel value.
2. This is **v2**: no blue gradient in the background, and a lightning video background (HANDOFF §2.1) — implement it exactly as described there, using the files in `assets/video/`.
3. Use `tokens/tokens.css` (and `tokens.json`) as the single source for colors, fonts, sizes and motion. Self-host the fonts from `assets/fonts/fonts.css`. Copy `assets/` into the app's public/static folder.
4. Render all four pages (Start, Games, Projects, Community) as Astro pages from the content collections built from `content/*.json` — do not hard-code card copy.
5. Build one reusable container component with the variants in HANDOFF §5 (active/inactive, community/game/project/start, desktop/tablet/mobile numbering).
6. Implement every behavior in §4, §6, §7, §8 and §9: sidebar auto-collapse/expand, tablet overlay, mobile fixed header + bottom page menu, scroll snapping with active highlight, and the SCROLL / BACK TO TOP / idle-arrow control.
7. Stack: **Astro + TypeScript (strict), static output**, as set out in HANDOFF §0. Scaffold with `npm create astro@latest` (minimal template), follow the project structure there, load `content/*.json` as content collections with Zod schemas, and use `<ClientRouter />` with `transition:persist` on the background video, sidebar/rail, nav, footer and mobile header/menu. No UI framework, no Tailwind. If the repo already uses a different framework, ask before switching.
8. When done, run the app and compare it against each reference screen at 1440×810, 1024×778 and 390×844, fix differences, and walk through the acceptance checklist in §12.
