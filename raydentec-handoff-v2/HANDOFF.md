# RAYDENTEC site — Design handoff for Claude Code (v2)

> **What changed in v2:** the blue bottom gradient is removed from the page background (Blue `#0039F0` stays as a reserved token for later), and a **lightning video background** is added, built the same way as the live raydentec.com (see §2.1). Everything else is unchanged from v1. **Default stack: Astro + TypeScript, static output** (see §0).

Build the RAYDENTEC personal site: a single-page app with a profile sidebar, four content "pages" (Start, Games, Projects, Community) that load into a scroll-snapping column of numbered containers, and three responsive layouts (desktop, tablet, mobile).

**Source of truth, in order:** this file → `reference/screens/*.png` (pixel reference) → `reference/artboards/*.html` (exact px/inline styles of each comp) → `tokens/` → `content/`.
The artboard HTML files are static design comps, **not** production code. Re-implement them as clean, componentized, responsive code.

---

## 0. Tech stack & architecture (default)

Use **Astro (latest stable) + TypeScript (strict)**, **static output**, no UI framework. If the repo already has a framework, ask before switching. Check the current Astro docs for exact API names; the patterns below have been stable since Astro 5.

| Concern | Choice |
|---|---|
| Framework | Astro, `output: 'static'` |
| Language | TypeScript, `strict` tsconfig preset |
| Styling | Plain CSS. Global `tokens.css` + `fonts.css`; scoped `<style>` per component. No Tailwind. |
| Interactivity | Small TS modules in `src/scripts/` (no React/Vue/Svelte islands) |
| Content | Astro **content collections** loaded from the handoff JSON |
| Page switching | Astro **ClientRouter** (view transitions) with `transition:persist` on the shell |
| Hosting | Any static host (Cloudflare Pages, Netlify, GitHub Pages). Build: `npm run build` → `dist/` |
| Node | Current LTS |

### Project structure
```
public/
  assets/            ← copy handoff assets/ here (logo, placeholder, icons, video, fonts)
src/
  content.config.ts  ← collections: site, start, games, projects, community
  content/           ← copy handoff content/*.json here
  styles/tokens.css  ← from handoff tokens/
  styles/global.css  ← @import fonts + tokens, base resets, .bg-video
  layouts/Shell.astro          ← html/head, ClientRouter, bg video, top bar, sidebar, nav, footer, scroll control, mobile header + menu
  components/
    Sidebar.astro  Rail.astro  Nav.astro  Footer.astro  ScrollControl.astro
    MobileHeader.astro  MobileMenu.astro  SocialLinks.astro  Icon.astro (inline SVG by name)
    ContainerFrame.astro       ← highlight column / notch tab / numbering (§5)
    CommunityCard.astro  GameCard.astro  ProjectCard.astro  StartIntro.astro  StartExplore.astro  LinkGrid.astro
  pages/
    index.astro  games.astro  projects.astro  community.astro   ← each = Shell + ContentColumn of its collection
  scripts/
    bg-video.ts  sidebar.ts  snap.ts  scroll-control.ts  mobile-menu.ts
```

### Content collections
Load each JSON with the `file()` loader (or `glob()` if you split items into files) and give each a Zod schema matching the JSON shape, so bad content fails the build. Item order = array order; container numbers = index + 1 (Start: unnumbered).

### Page switching & persistence
- Add `<ClientRouter />` in `Shell.astro`'s `<head>`.
- Mark these elements `transition:persist` so they survive navigation without reloading or resetting: **the background `<video>`** (the loop must not restart), **sidebar / rail** (keep the expanded/collapsed state), **top nav** (only update `aria-current`), **footer**, **mobile header and menu bar**.
- Only the **content column** swaps. Use a short fade (≈160ms) on it; respect `prefers-reduced-motion` (no animation).
- After each navigation, reset the content column scroll to 0. That shows SCROLL and re-expands the desktop sidebar, as at the top of the page.
- Scripts: initialise inside `document.addEventListener('astro:page-load', …)` and make every init idempotent (persisted elements must not get duplicate listeners; re-bind only what lives in the swapped content column, e.g. the snap observer).
- Real URLs: `/`, `/games`, `/projects`, `/community` (works without JS as plain multi-page links).

---

## 1. Package contents

```
HANDOFF.md                  ← this brief
CLAUDE_CODE_PROMPT.md       ← kickoff prompt to paste into Claude Code
tokens/tokens.css           ← CSS custom properties (colors, fonts, layout per breakpoint)
tokens/tokens.json          ← same values + full type scale + motion, machine-readable
content/site.json           ← name, tagline, bio, sidebar socials, CTAs, nav, footer
content/start.json          ← Start page containers (UNNUMBERED)
content/games.json          ← Games containers (placeholders)
content/projects.json       ← Projects containers (placeholders)
content/community.json      ← Community containers (real links from raydentec.com)
assets/logo.png             ← logo tile (1500×1500, red on black)
assets/placeholder-render.jpg ← placeholder still for every card image
assets/video/               ← lightning-desktop.mp4 (1280×720) + lightning-mobile.mp4 (540×960), 10s loops, + poster JPGs
assets/icons/*.svg          ← line icon set (24px grid, 1.75 stroke, square caps, currentColor)
assets/fonts/               ← self-hosted woff2 (latin) + fonts.css + OFL licenses
reference/screens/*.png     ← @2x renders of every comp
reference/artboards/*.html  ← comp source (open in a browser; uses ../../assets)
```

| Screen | File |
|---|---|
| Desktop · Community · top, sidebar expanded | `Main` |
| Desktop · Community · scrolled, sidebar collapsed | `Desktop-Community-Scrolled` |
| Desktop · Start | `Desktop-Start` |
| Desktop · Games | `Desktop-Games` |
| Desktop · Projects | `Desktop-Projects` |
| Tablet · rail collapsed | `Tablet-Community-Collapsed` |
| Tablet · sidebar overlay open | `Tablet-Sidebar-Expanded` |
| Mobile · top of page | `Mobile-Top` |
| Mobile · scrolled, fixed header | `Mobile-Scrolled` |
| Mobile · page menu open | `Mobile-Menu-Open` |
| Behavior spec / design system boards | `Spec`, `Design-System` |

---

## 2. Foundations

**Colors** — Red `#CC181E`, Black `#000`, White `#FFF`, Grey `#808080`. Blue `#0039F0` is **reserved** — keep the token (`--c-blue`) but don't use it anywhere in v2. Dim red `rgba(204,24,30,.5)` for inactive borders. Control fill `rgba(255,255,255,.5)`.

**Page background** (fixed to viewport, never scrolls):
```css
background:
  linear-gradient(180deg, rgba(204,24,30,.25) 0%, rgba(204,24,30,0) 48%),
  #000;
```
Plus a 6px solid red bar across the very top of the viewport.

### 2.1 Background video (new in v2)

Same technique as raydentec.com. Layer order, bottom to top: black → red top gradient → **video (screen blend)** → all UI.

```html
<video class="bg-video" id="bgVideo" autoplay muted loop playsinline preload="auto"
       aria-hidden="true" poster="assets/video/lightning-mobile-poster.jpg"></video>
```
```css
.bg-video {
  position: fixed; inset: 0; width: 100%; height: 100%;
  object-fit: cover; mix-blend-mode: screen; opacity: .9;
  pointer-events: none; z-index: 0;
}
@media (prefers-reduced-motion: reduce) { .bg-video { display: none; } }
```
```js
// Load only the clip that matches the layout: landscape ≥1024px, portrait below.
(function () {
  const v = document.getElementById('bgVideo');
  if (!v || matchMedia('(prefers-reduced-motion: reduce)').matches) return; // never load
  const mq = matchMedia('(min-width: 1024px)');
  function pick() {
    const d = mq.matches;
    const src = d ? 'assets/video/lightning-desktop.mp4' : 'assets/video/lightning-mobile.mp4';
    v.poster = d ? 'assets/video/lightning-desktop-poster.jpg' : 'assets/video/lightning-mobile-poster.jpg';
    if (v.getAttribute('src') !== src) { v.src = src; v.play().catch(() => {}); }
  }
  pick();
  mq.addEventListener('change', pick);
})();
```
- `screen` blend makes the black frame transparent, so only the blue lightning and its glow show through, over the red gradient.
- The video is decorative: `aria-hidden`, no controls, no pointer events. All UI (sidebar, nav, containers, buttons, footer) sits above it (`z-index ≥ 1`). Containers keep their solid black fill, so the lightning shows in the gaps, the sidebar area and behind the nav/footer.
- Note: the video switch is at **1024px** (as on raydentec.com), which is independent of the 1280px desktop/tablet layout breakpoint — tablet ≥1024 gets the landscape clip.
- Reference screens show the poster frames; the real page plays the 10s loop.
- In Astro: render the `<video>` once in `Shell.astro` with `transition:persist="bg-video"`, served from `public/assets/video/`; run the picker from `src/scripts/bg-video.ts` once (guard against re-init on `astro:page-load`).

**Fonts** (self-host from `assets/fonts/fonts.css`):

| Role | Font | Notes |
|---|---|---|
| Name "RAYDEN" only | Russo One 400 | 46 desktop · 44 tablet · 40 mobile top · 28 mobile header |
| Nav, headlines, body | Sora 500/600/700 | Body/description: 500, letter-spacing −0.05em, grey, tight line-height (1.04; 1.25 on mobile) |
| Buttons, numbers, footer | Chakra Petch 500/600/700 | Buttons 600 uppercase +0.02em; numbers 700 |
| Eyebrow labels, captions beside buttons | IBM Plex Mono 400/500 | 15 desktop · 13 tablet/mobile, grey |

Full scale per breakpoint: `tokens/tokens.json → type`.

**Icons** — `assets/icons/`. Use inline SVG (they use `currentColor`). Sidebar socials: youtube, instagram, x, globe (website), mail.

**Breakpoints** — Desktop ≥ 1280 · Tablet 768–1279 · Mobile < 768. Comps: 1440×810, 1024×778, 390×844.

---

## 3. App shell (all breakpoints)

- Full-viewport shell (`height: 100dvh`, `overflow: hidden`). **Only the content column scrolls** (desktop/tablet). On mobile the main document area between header and footer scrolls.
- **Footer** fixed at bottom: 46px (42 tablet, 45 mobile), 1px red top rule, `rgba(0,0,0,.35)` fill, Chakra Petch 600 12px grey. Left: "© 2026 RAYDENTEC. All rights reserved." Right: "Legal Info" link.
- **Top nav** (desktop/tablet): centered on the *viewport* (not the content column), top 45px, 56px tall row. Sora 600 36px (32 tablet), −0.04em, 36px gaps. Active = white + `aria-current="page"`; others 50% white (hover 80%).
- Routes: `/` (Start), `/games`, `/projects`, `/community` as real Astro pages; navigation via ClientRouter keeps the shell persisted and swaps only the container list (§0).

---

## 4. Desktop (≥ 1280)

### Sidebar — expanded (see `Main.png`)
Left 52px, top 45px, 320px wide. Stack:
1. Logo tile 170×170 (`assets/logo.png`)
2. "RAYDEN" Russo One 46 (16px gap above)
3. "Creator of Virtual Worlds" Sora 600 22 white / "@RAYDENTEC" Sora 700 22 red (line-height 1.15)
4. 5 social icon links: 45×45, `#1C1C1C`, white 22px icons, 7px gap
5. Bio: Sora 500 29px, lh .98, −0.055em, grey, ~300px wide
6. "Join me on this journey:" Sora **600** 27px, −0.055em, white
7. **WATCH MY VIDEOS** — 318×56, red fill, black label + ↗ (primary)
8. **CONNECT ON SOCIALS** — 318×56, 2px red outline, red label + ↗ (secondary), 8px gap

**Collapse button** (←): 56×56 at left 315/top 45 (beside nav row). 2px white border, `rgba(255,255,255,.5)` fill + 6px backdrop blur.

### Sidebar — collapsed rail (see `Desktop-Community-Scrolled.png`)
56px wide at left 52:
- Logo tile 56×56 at top 45
- **EXPAND** button 56×300 starting 12px below logo (aligned with the first container's top): 2px white border, 50% white fill + blur, → icon at top, vertical "EXPAND" label (Chakra Petch 600 20px, `writing-mode: vertical-rl; rotate(180deg)`) at bottom
- Bottom group aligned to the containers' bottom: "Join me:" (Sora 600 15px), then **VIDEOS** (56×56 red fill, black ↗ + 9px label) and **SOCIALS** (56×56 red outline) with 8px gap

### Collapse behavior
- Auto-collapse when content `scrollTop > 80`. Auto-expand only when `scrollTop === 0`.
- If the user clicks EXPAND while scrolled, keep it open until they scroll again past a further 80px or click ← .
- Expanded: content column at x = 416 (right of sidebar). Collapsed: content column **re-centers on the viewport**.
- Animate the column position/sidebar width 320ms `cubic-bezier(.2,.8,.2,1)`; fade sidebar content 160ms.

### Content column
- Width 994px, top 113px, bottom = 30px above the footer rule. Container height 300px, gap 16px.
- Scroll track at far right: 6px wide, `rgba(255,255,255,.06)` track, red thumb mirroring scroll position.

---

## 5. Containers (the core component)

All pages share one container frame with a **highlight on the LEFT and the number at the TOP**:

| State | Frame |
|---|---|
| **Active** (snapped) | 2px red border around the body; a solid red column (45px desktop / 40 tablet) down the full left side; number at top in **black**, Chakra Petch 700 (44 / 38 / 34) |
| **Inactive** | Body border 1.5px dim red; instead of the column, a **notch tab** at top-left (column width × 90px desktop / 80 tablet) with border on top/left/bottom, open to the right so it merges with the body; number in 60% red; body content at **42% opacity** |

State transitions animate 240ms. Container outer width is constant (column + body = 994 desktop / 776 tablet).

**Mobile variant:** number moves into a tab *above* the body. Active = full-width red bar (38px) with black number; inactive = 86×38 notch tab at left, body top border continues to the right of it.

### Variants by page
- **Community** (`community.json`): image 426×239 left (inset 28px), text right: brand-colored icon tile (74×48) + mono eyebrow + Sora 600 28 title; description; **OPEN LINK** button (225×56, 2px red outline, red Chakra 600 21px, ↗) + mono caption beside it.
  Icon tile colors: YouTube `#FF0000` (filled play glyph), Twitch `#9146FF`, Instagram `#E1306C`, X `#000`, GitHub `#24292F`, ArtStation `#13AFF0`, Discord `#5865F2`, Email `#CC181E`. X and GitHub tiles get a 1px `rgba(255,255,255,.35)` border.
  Last item is a `linkGrid` ("More links"): render as a grid of compact link rows (mono label + ↗) inside the same frame.
- **Games** (`games.json`): same inset image left (426×239), text right: eyebrow, Sora **700** 32 title, description, two mono chips ([PLATFORM] grey outline, [STATUS] red outline), **VIEW GAME** + caption.
- **Projects** (`projects.json`): text left, image 426×239 right. Eyebrow, title, description, small mono `Stack / Year` definition list, **VIEW PROJECT** button (270px wide, one line, no caption).
- **Start** (`start.json`): **unnumbered** — same frame and same red column/notch tab, just no number.
  1. Intro (530px tall): banner image across the top (220px tall, inset 28px), then eyebrow, Sora 700 46 title, description, **EXPLORE GAMES** (primary) + **SEE PROJECTS** (secondary) buttons, 240×56 each. 29px padding top and bottom.
  2. Explore (330px): eyebrow + title, then a 3-column grid (Games / Projects / Community) — each column has a 2px red top rule, icon, title, short text and a red "GO TO …" link.

Buttons never wrap (`white-space: nowrap`). Hover on outline buttons: red fill, black label.

---

## 6. Scroll snapping & active item

- Content column: `scroll-snap-type: y mandatory`; each container `scroll-snap-align: start`.
- The snapped container is **active**. Detect with `IntersectionObserver` (threshold ≥ .6 within the column) or the `scrollend` event. Keyboard focus inside a container also makes it active.
- Numbers restart at 1 on each page.
- `prefers-reduced-motion`: no smooth scrolling, no snap animation, instant state changes.

---

## 7. Scroll indicator / Back to top (one control, three states)

| State | When | Look |
|---|---|---|
| **SCROLL ↓** | `scrollTop === 0` | 318×56 (306×54 tablet), label + ↓ |
| **BACK TO TOP ↑** | while/after scrolling | same size, label + ↑ |
| **Idle arrow** | 1.2s with no scroll (not at top) | collapses to 56×56 (54 tablet/mobile) arrow-only; width animates from the right edge, 200ms. Any scroll re-expands it |

Style: 2px white border, `rgba(255,255,255,.5)` fill + 6px backdrop blur, Chakra Petch 600 24px white. Position: right-aligned to the content column's right edge, bottom-aligned with the containers (overlaps the lower container — intentional).
Click SCROLL → snap to next container. Click BACK TO TOP → smooth scroll to 0.

---

## 8. Tablet (768–1279) — see `Tablet-*.png`

- Default: collapsed rail (54px wide, gutter 28). Expand button 54×287. Content column 776px centered; containers 287px tall; image 230×230 square.
- **EXPAND** opens a 400px black sidebar **over** the content (does not push). Content gets a `rgba(0,0,0,.5)` dimmer. Sidebar contents = desktop expanded stack at tablet sizes (logo 162, name 44, buttons 306×54); ← close button (54×54) at its top-right (left 303).
- Close on: ← button, dimmer click, `Esc`, **or any scroll** of the content.
- Focus moves into the panel on open; returns to EXPAND on close. Use `aria-expanded` / `aria-controls`.

---

## 9. Mobile (< 768) — see `Mobile-*.png`

- **Top of page** (`Mobile-Top.png`): the sidebar is the first block of the scroll flow: logo 140, RAYDEN 40, tagline 20, socials 43px, bio 27, "Join me on this journey:" 26, two CTAs 307×52. Gutter 22.
- Fixed at bottom (above footer): SCROLL button (full width 346×54), and below it the **page menu bar** (346×54, black, 2px red border, current page name Sora 600 22 + ☰).
- **Scrolled** (`Mobile-Scrolled.png`): once the profile block scrolls past the top, a fixed **121px header** appears: logo 72, RAYDEN (Russo One 28), tagline + handle (14px), and a **SOCIALS** 54×54 outline button at right (opens social links — scroll to/route to Community or a small sheet). Content scrolls *under* the header and is **clipped** at its bottom edge (mask, not overlap). The scroll control becomes the 54×54 ↑ arrow at right, above the menu bar.
- **Menu open** (`Mobile-Menu-Open.png`): tapping the bar opens a black panel growing up from the bar (no border) with 4 rows (56px, Sora 600 26px, mono index "01–04" at right). Active row: 6px red left bar + `rgba(204,24,30,.12)` tint, white text; others 50% white. Bar icon becomes ×. Content dims 50%. Close on select, ×, dimmer tap, `Esc`.
- Mobile containers use the top-tab numbering (see §5). Snap still applies.

---

## 10. Accessibility

- Real `<a>` / `<button>`; `aria-label` on icon-only controls; `aria-current="page"` on active nav.
- Red `#CC181E` on black is ~3.9:1 → only use red text at ≥ 18px semibold (buttons, handle). Grey on black ≈ 5.3:1 (OK).
- Inactive (dimmed) containers go to full opacity on hover/focus.
- Visible focus: 2px white outline, 3px offset. Targets ≥ 44px.
- External links: `target="_blank" rel="noopener"`.

---

## 11. Content notes / TODO

- Community links come from raydentec.com. **Discord invite URL is not published yet** → render that button disabled with its caption until set.
- Copy for Twitch/Instagram/X/GitHub/ArtStation/Discord/Email cards is draft — keep it in JSON so it's easy to edit.
- Games and Projects are bracketed placeholders; the renderer must handle any number of items.
- Every card image currently uses `assets/placeholder-render.jpg`; each JSON item has its own `image` field.

---

## 12. Acceptance checklist

- [ ] Matches each `reference/screens/*.png` at its comp size (spacing, type, colors).
- [ ] Desktop sidebar auto-collapses past 80px, expands at top, toggles manually; content column re-centers.
- [ ] Tablet sidebar overlays with dimmer, closes on scroll/Esc/dimmer/←.
- [ ] Mobile: inline profile → fixed header with clipped content; bottom menu bar + popup menu.
- [ ] Scroll snapping; active container highlight; inactive notch + 42% content.
- [ ] Start page containers have the frame but no numbers.
- [ ] Scroll control cycles SCROLL → BACK TO TOP → idle arrow.
- [ ] Astro + TS static build (`npm run build`) with no type or content-schema errors.
- [ ] All four pages render from the content collections (`content/*.json`).
- [ ] Navigating between pages keeps the video playing and the sidebar state; only the content column changes.
- [ ] Background: red top gradient only (no blue); lightning video plays behind the UI with `screen` blend at .9 opacity; correct clip at ≥/< 1024px, swaps on resize; hidden and not loaded with reduced motion.
- [ ] Keyboard and screen-reader pass; `prefers-reduced-motion` respected.
