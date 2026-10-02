# RAYDENTEC_WEBSITE_1

RAYDENTEC personal site: Astro + TypeScript (strict), static output, no UI framework.
Built from the design handoff in `raydentec-handoff-v2/` (see `HANDOFF.md` there).

## Commands

| Command           | Action                                                    |
| :---------------- | :-------------------------------------------------------- |
| `npm install`     | Install dependencies                                      |
| `npm run dev`     | Dev server at `localhost:4321`                            |
| `npm run check`   | Type + content-schema check (`astro check`)               |
| `npm run build`   | Check, then build the static site to `dist/`              |
| `npm run preview` | Serve the built `dist/` locally                           |

## Editing content

All copy lives in `src/content/*.json` (validated by the Zod schemas in
`src/content.config.ts`, so a malformed entry fails the build). Item order is
array order; container numbers are index + 1 (Start is unnumbered). An `href`
of `null` or a bracketed placeholder like `"[URL]"` renders a disabled button.

Design tokens: `src/styles/tokens.css`. Static assets (logo, images, icons,
video, fonts): `public/assets/`.
