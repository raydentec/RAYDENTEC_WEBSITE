# Content editing guide

How to change the site's content (categories, games, projects, images and the text on the
pages) without touching its structure or behaviour.

The safest approach is to treat every change as a content edit in a few known files, made on a
git branch and checked by the build before it goes live. The site is set up for this: all the
copy, games, projects and categories live in content files, the build rejects malformed
content, and git keeps every version, so nothing is ever lost.

## Where each kind of content lives

| To change | Edit | Rules the build checks |
|---|---|---|
| Name, tagline, bio, buttons, socials, footer, nav labels | `src/content/site.json` | All fields required |
| Start: hero slides, lower third, explore row, About me | `src/content/start.json` | Image paths must start with `assets/` |
| Games | `src/content/games.json` | `releaseDate` as `YYYY-MM-DD`; rows are made from `categories` (a game in several categories appears in each row) |
| Projects | `src/content/projects.json` | `category` must be one of the project categories |
| Project categories (add, rename, reorder) | `src/lib/project-categories.ts` | That list is also the allowed values for `category` above |
| Community links and link grid | `src/content/community.json` | Also feeds the `/links` page |
| Legal documents | `src/content/legal/*.md` | A new `.md` file becomes `/legal/<file name>` |
| Images | `public/assets/…` | Referenced from the content files as `assets/…` |
| Icons | `public/assets/icons/*.svg` (`social/` for Community tiles and cards) | Not checked; see "Add or update an icon" below |

- A link set to `null` or to a bracketed placeholder such as `"[URL]"` shows as a **disabled**
  button, so you can add an item before its link exists. External links open in a new tab.
- Items listed by date (games in a row, projects in a group) are sorted **newest first**
  automatically; their order in the file doesn't matter.
- The container numbers on a page follow the items' positions.
- The full content conventions are in `AGENTS.md` ("Content conventions").

## A safe editing routine

1. **Start a branch.** The live site keeps running from `main` meanwhile.

   ```
   git switch -c content/new-games
   ```

2. **Edit the content and add images.** Keep image file names lowercase with dashes
   (`my-game-cover.jpg`), and compress images before adding them. The hero and the cards fill
   large areas, so about 2000 px wide for hero slides and about 1200 px for cards is plenty.

3. **Preview it.**

   ```
   npx astro dev --background --host
   ```

   Open `http://localhost:4321` on the computer, or the network address it prints on your phone
   (same Wi-Fi). Stop it with `npx astro dev stop`.

4. **Check it.**

   ```
   npm run build
   ```

   A missing field, a mistyped category, a bad date or an image path without `assets/` stops the
   build with a message naming the file and field. Nothing broken can go live this way.

5. **Commit, merge and push.** Amplify rebuilds and deploys `main` automatically.

   ```
   git add -A
   git commit -m "Games: add Project X"
   git switch main
   git merge content/new-games
   git push
   ```

6. **Undo, if needed.** Any change can be reversed, even after it's live: `git revert <commit>`
   brings back the previous version.

**Optional safety net:** Amplify can build a preview URL for every branch you push (branch
deployments). Changes can then be seen online, on real devices, before they reach
`www.raydentec.com`.

## Examples

### Add a game (`src/content/games.json`)

Add an object to `items`:

```json
{
  "categories": ["Adventure"],
  "title": "My New Game",
  "releaseDate": "2026-12-01",
  "description": "One or two lines pitching the game and its world.",
  "platform": "Windows",
  "status": "In development",
  "href": "https://store.example.com/my-new-game",
  "buttonLabel": "VIEW GAME",
  "caption": "Available for",
  "image": "assets/games/my-new-game.jpg"
}
```

- A new category name in `categories` creates a new row on the Games page. Rows are sorted
  alphabetically.
- Use `"href": null` until the store page exists; the button shows disabled.

### Add a project (`src/content/projects.json`)

```json
{
  "category": "Tools",
  "title": "My New Tool",
  "releaseDate": "2026-12-01",
  "description": "What it is, what it does and why it was built.",
  "stack": "Unreal Engine / C++",
  "href": "https://github.com/raydentec/my-new-tool",
  "buttonLabel": "VIEW PROJECT",
  "image": "assets/projects/my-new-tool.jpg"
}
```

`category` must be one of the names in `src/lib/project-categories.ts` (currently Apps,
Experiments, Plugins, Products, Tools).

### Add or reorder a project category (`src/lib/project-categories.ts`)

```ts
export const projectCategoryOrder = {
  Apps: 1,
  Experiments: 2,
  Plugins: 3,
  Products: 4,
  Tools: 5,
  Shaders: 6, // new: its group and filter button appear after Tools
} as const;
```

The numbers set the order of the groups and the filter buttons. Renaming a category here means
renaming it in every project that uses it; the build lists any that still use the old name.

### Add a hero slide (`src/content/start.json`, `hero.images`)

```json
{ "src": "assets/hero/new-slide.jpg", "portrait": "assets/hero/new-slide-portrait.jpg" }
```

- `src` is the landscape image (desktop and tablet). `portrait` is an optional upright image,
  used in the phone layout.
- To change where an image is anchored when it's cropped, add `"mobilePosition"` and/or
  `"portraitPosition"` (CSS `object-position`, for example `"50% 35%"`). Otherwise the defaults
  in `hero.imagePosition` apply.

### Add a legal document (`src/content/legal/`)

Create a file such as `cookie-policy.md`. It's published at `/legal/cookie-policy` and listed on
the Legal page:

```md
---
title: "Cookie Policy"
subject: "Website"
group: "policies"
order: 2
updated: "December 1, 2026"
---

The document text, in Markdown.
```

`group` is `agreements` or `policies`; `order` sets its position within the group.

### Add or update an icon (`public/assets/icons/`)

Icons are drawn on a 24 × 24 px artboard in a single colour, and the site inlines them so they take
the colour of the text around them. The file name is the name used in the code
(`gamepad.svg` → `<Icon name="gamepad" />`).

Export from Illustrator with **File → Export → Export As… → SVG**, using these settings:

- **Styling:** Presentation Attributes
- **Font:** Convert to Outlines
- **Object IDs:** Minimal
- **Decimal:** 1
- **Minify:** on
- **Responsive:** off (this keeps `width` and `height`)

Then open the file in a text editor and make the opening tag match the other icons, removing any
`id`, `version`, `class` or `style`, as well as `fill` colours on the shapes:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">…</svg>
```

`fill="currentColor"` is the one that matters most: without it the icon shows black instead of
following the button or link colour. Also remove any `<?xml …?>` line or Illustrator comment if
present.

The dev server keeps icons in memory once it has read them, so after replacing an icon, restart it
(`npx astro dev stop`, then `npx astro dev --background`) to see the new one. `npm run build`
always uses the current files.

## If you'd rather not edit JSON by hand

A git-based content editor such as Keystatic (which supports Astro's content collections) adds an
admin page with forms for games, projects and so on, plus image uploads. It saves to the same
JSON files and commits through git, so the site and the build's safety checks stay exactly as
they are. It's worth adding if editing happens often or someone else will edit; for occasional
changes, the routine above is enough.
