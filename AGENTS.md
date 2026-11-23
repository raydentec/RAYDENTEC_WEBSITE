# AGENTS.md: RAYDENTEC website

The RAYDENTEC personal site, live at **https://www.raydentec.com**: a creator portfolio with four menu pages
(Start, Games, Projects, Community) plus Legal and 404 pages. All content is laid out as
scroll-snapping columns of numbered "containers", in three responsive layouts.

## Stack (do not change without asking)

- **Astro 7 + TypeScript (strict preset), `output: 'static'`**. Node ≥ 22.12.
- **No UI framework, no Tailwind.** Plain CSS: global `src/styles/tokens.css` + `global.css`,
  scoped `<style>` in each component. Interactivity is small TS modules in `src/scripts/`.
- **Content collections** with Zod schemas (`src/content.config.ts`): bad content fails the build.
- **`<ClientRouter />`** (view transitions) with `transition:persist` on the shell.
- Hosting: **AWS Amplify** (`amplify.yml`: Node 22, `npm ci`, `npm run build`, serves `dist/`), live at https://www.raydentec.com.

## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.
(Use `npx astro …` if `astro` isn't on PATH.) Dev server: `localhost:4321`.

| Command | What it does |
|---|---|
| `npm run check` | `astro check`: types + content schemas. Run after every change. |
| `npm run build` | check, then build to `dist/`. This must pass before you report work as done. |
| `npm run preview` | Serve `dist/` |

Verify UI changes in a browser at the three comp sizes: **1440×810** (desktop),
**1024×778** (tablet), **390×844** (mobile).

## Project map

```
src/
  content.config.ts        collections: site, start, games, projects, community, legal
  content/*.json           ALL page copy (edit here, never hard-code card copy)
  content/legal/*.md       legal documents (frontmatter: title, subject, group, order, updated)
  lib/content.ts           ROUTES, getItems/getSite/getStart, newestFirst, asset(), isPlaceholder(), linkAttrs()
  lib/project-categories.ts  Projects categories + their order (also feeds the schema enum)
  layouts/Shell.astro      html/head, bg video + glow, nav, rail, sidebar, mobile header/menu,
                           #scroller (the content column), track, scroll control, footer, all scripts
  components/              ContainerFrame (the core frame), *Card, GameRow, Start*, Sidebar, Rail, …
  pages/                   index (Start), games, projects, community, 404, legal/index, legal/[slug],
                           links (/links: a plain link-in-bio page, no Shell, its own styles)
  scripts/                 behaviour modules (see below); dom.ts = shared helpers
  styles/tokens.css        design tokens per breakpoint; global.css = base, buttons, page transitions
public/assets/             logo, images, icons/*.svg, video/, fonts/ (self-hosted woff2)
```

## Design

**The current code is the source of truth.** The original design handoff was removed, so when
a comment cites "HANDOFF §n", treat it as history and go by the code. What each page
looks like now:

- **Start:** a full-bleed hero image slider with a lower third, then the "What you can find here" explore row, then About me.
- **Games:** one sideways-scrolling row per category.
- **Projects:** groups by category, with a filter panel (FILTER button).
- **Community:** Social Accounts tiles, then the "More ways to connect" grid, then a sideways row of numbered Links cards.
- **Legal** (linked from the footer) and **404**.
- A lightning video background with an on/off switch (BgToggle). When off, a still blue glow shows instead.

Foundations: Red `#CC181E`, Black, White, Grey `#808080`. Blue `#0039F0` is in the tokens, but
the design does not use it. Fonts: Russo One (the "RAYDEN" name only), Sora (nav/headlines/body),
Chakra Petch (buttons, numbers, footer), IBM Plex Mono (eyebrows, captions).
Breakpoints: **desktop ≥1280 · tablet 768–1279 · mobile <768** (the bg video switches
clips at 1024, which is a separate breakpoint).

## Content conventions

- JSON files are `{ page, items: [...] }`. The `itemsParser` in `content.config.ts` unwraps
  `items` and adds `order` (array index) and `id` (`"01"`, `"02"`…). Container number = position + 1.
- Asset paths in content are relative to `public/` and must start with `assets/`. Render them with `asset()`.
- `href` set to `null`, or to a bracketed placeholder like `"[URL]"`, renders a **disabled** button (`isPlaceholder`).
  External links open in a new tab (`linkAttrs`).
- `releaseDate` is `YYYY-MM-DD`. Games rows and Projects groups list items newest first.
- Start hero `images`: a path, or `{ "src": "assets/…", "mobilePosition": "center" }` to give
  that slide its own mobile placement (CSS `object-position`; otherwise `imagePosition.mobile`).
  Add `"portrait": "assets/…"` for an upright image shown instead in the mobile layout
  (`max-width: 767px`, any orientation), placed by `"portraitPosition"` (default `center`).
- Games: one row per category (rows sorted alphabetically). A game in several categories appears in each of their rows.
- Projects: `category` must be one of `projectCategoryOrder` in `lib/project-categories.ts`.
  To add a category, add it there.
- Community: link items + `type: "linkGrid"` items. The first 10 link items become the Social Accounts tiles.
  The `/links` page (`pages/links.astro`) lists the same link items (with their optional `handle`, e.g.
  `"@raydentec"`, under the label; else `caption`), the linkGrid's links and `site.json` sidebarSocials.
- Games/Projects entries and most images are still **placeholders** (`placeholder-render.jpg`).
- Legal docs: add a `.md` file to `src/content/legal/` and it gets the page `/legal/<filename>`.

## Behaviour architecture (read before touching scripts)

- **Only `#scroller` (the content column) scrolls**, never the window. On mobile the profile block
  sits at the top of the scroller.
- All scripts are imported once in `Shell.astro`. Their top level runs once per full load. Bind
  document/window/persisted-element listeners at top level, and re-read anything inside
  `#scroller` on `astro:page-load` (`onPageLoad`). **Every init must be idempotent** (guard with `dataset.init`).
- **UI state lives in `data-*` attributes on `<html>`** (`sidebar`, `overlay`, `mmenu`, `mheader`,
  `heroActive`, `bg`, `resizing`…) so CSS can react. ClientRouter replaces `<html>` attributes on
  every swap, so always use `setRootState` / `getRootState` from `dom.ts`. They re-apply state after each swap.
- Use `onScrollerScroll` (one capturing listener) instead of adding your own scroll listeners.
- Containers are `[data-cf]`. The active one has `.is-active`. `snap.ts` sets it and fires
  `ACTIVE_CHANGE` (`raydentec:active-change`) on `document`. `containers()` skips games inside
  rows (`[data-row]`) and containers hidden by the filter. Use `snapTop` / `snapOffset`, which
  honour `scroll-margin-top` / `scroll-padding-top`.
- Modules: `snap` (active container), `sidebar` (desktop auto-collapse / tablet overlay),
  `scroll-control` (SCROLL / BACK TO TOP / idle arrow + track), `wheel` (forwards wheel input
  from anywhere to the column), `game-rows` (sideways rows, ←/→ keys), `start` (hero vs explore
  state), `hero-slider`, `project-filter` (sessionStorage), `mobile-menu`, `page-transition`
  (slide direction by menu order, rail/sidebar cross-fade), `bg-video` (clip picker + glow switch, localStorage).
- Shell props: `page`, `label` (non-menu pages), `srHeading`, `rows` (full-width sideways rows),
  `backToTopOnly`. Overlays outside the column go in `<slot name="overlay" />`.
- `prefers-reduced-motion`: no video, no smooth scroll, no slider timer. Keep it this way.
- Accessibility: real `<a>`/`<button>`, `aria-label` on icon-only controls, `aria-current` on
  the nav (`mobile-menu.ts` syncs the persisted nav), 2px white focus outline, red text only at ≥18px semibold.

## Code style

- Follow the existing comment style: each component/script starts with a block comment that
  says what it does and why, and names the related files. When you change behaviour, update these comments.
- Icons: `<Icon name="…" />` inlines `public/assets/icons/<name>.svg` (24px grid, `currentColor`).
  Add new icons as SVG files there.
- Use the tokens (`--c-*`, `--f-*`, `--t-*`, layout vars) instead of raw values where one exists.
  Per-breakpoint sizes go in `@media (max-width: 1279px)` / `(max-width: 767px)` blocks.
- Commit messages: short, `Area: what changed` (e.g. `Community: …`, `Hero slider: …`).

## Gotchas

- Astro needs Node ≥ 22.12 (local: Homebrew Node 26; Amplify: Node 22). Older Node makes
  `astro check` / `build` / `dev` refuse to run.
- The production CSS minifier drops a separate `translate:` property in a rule that also sets
  `transform:`. The dev server doesn't minify, so it only breaks live. Put the shift inside
  `transform` (e.g. `transform: translateX(-50%) rotate(180deg)`), and check visual fixes
  with `npm run build` + `npm run preview`, not only `astro dev`.
- The background dev server sometimes keeps serving an old copy of a component's `<style>`
  after you edit it (seen with `StartHero.astro`). If a CSS change doesn't show up locally,
  check the built CSS in `dist/_astro/` and restart the server: `astro dev stop`, then
  `astro dev --background`.
- Safari: `overflow`/`clip-path` on a plain parent doesn't clip a child that Safari has moved
  to its own GPU layer (e.g. while its opacity/transform animates). Give the clipping element
  `transform: translateZ(0)` too (see the label masks in Rail, ScrollControl, FilterButton).

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
