# Lightning background — 2× versions (not used by the site)

The background lightning clips at twice the resolution of the ones the site plays
(`public/assets/video/`), kept for later use. This folder is outside `public/`, so it is not
part of the build.

| File | Size |
|---|---|
| `lightning-desktop.mp4` | 2560×1440, 10 s, 30 fps |
| `lightning-mobile.mp4` | 1080×1920, 10 s, 30 fps |
| `lightning-desktop-poster.jpg` | 2560×1440 (frame 20: the first strike at full brightness) |
| `lightning-mobile-poster.jpg` | 1080×1920 (frame 20) |

Same animation as the 1× clips: the original lightning loop traced frame by frame and redrawn,
each bolt following a hand-drawn silhouette, with the original's timing, glow and background.

To use them, copy them over the files of the same name in `public/assets/video/` (the code
picks them by name: `src/scripts/bg-video.ts`, `src/layouts/Shell.astro`).
