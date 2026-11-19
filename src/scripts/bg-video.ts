/**
 * Background video (HANDOFF §2.1): load only the clip that matches the layout —
 * landscape ≥1024px, portrait below — and never load it with reduced motion.
 * The <video> is persisted across navigation, so this runs once.
 *
 * Background switch (BgToggle.astro): <html data-bg="glow"> fades the video out and a still
 * blue glow in (global.css); the video is paused once faded out and played again when
 * switched back. The choice is remembered on this device (localStorage, when available).
 *
 * Keeping it playing (ensurePlaying): Safari sometimes left the video paused on page load —
 * the play() right after setting the source can be cut short while it loads, a video
 * hidden at first (opacity 0 under the Start hero) or in a tab opened in the background
 * may not start, and in Low Power Mode it only plays after the visitor interacts. So it is
 * started again whenever it may have stopped: once it can play, when the page / tab shows
 * (incl. back / forward cache), after every page change, when the hero hides / shows it,
 * when Safari pauses it by itself, and on the first touch / click / key / wheel.
 */
import { getRootState, setRootState } from './dom';

const DESKTOP = { src: '/assets/video/lightning-desktop.mp4', poster: '/assets/video/lightning-desktop-poster.jpg' };
const MOBILE = { src: '/assets/video/lightning-mobile.mp4', poster: '/assets/video/lightning-mobile-poster.jpg' };

function init() {
  const v = document.getElementById('bgVideo') as HTMLVideoElement | null;
  if (!v || v.dataset.init) return;
  v.dataset.init = '1';
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; // never load

  // Muted and inline as properties too: Safari checks those before it lets a video autoplay.
  v.muted = true;
  v.playsInline = true;
  const mq = matchMedia('(min-width: 1024px)');
  const pick = () => {
    const clip = mq.matches ? DESKTOP : MOBILE;
    v.poster = clip.poster;
    if (v.getAttribute('src') !== clip.src) {
      v.src = clip.src;
      ensurePlaying();
    }
  };
  pick();
  mq.addEventListener('change', pick);
  for (const type of ['loadeddata', 'canplay'] as const) v.addEventListener(type, ensurePlaying);
  // Paused by the browser (not by the switch): try again shortly.
  v.addEventListener('pause', () => window.setTimeout(ensurePlaying, 300));
}

/** Play the video if it should be playing (has a clip, not switched off, page visible). */
function ensurePlaying() {
  const v = video();
  if (!v || !v.paused || !v.getAttribute('src') || isGlow() || document.hidden) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  v.muted = true;
  v.play().catch(() => {
    // Not allowed yet (e.g. Low Power Mode) or interrupted: the triggers below try again.
  });
}

document.addEventListener('visibilitychange', ensurePlaying);
window.addEventListener('pageshow', ensurePlaying);
document.addEventListener('astro:after-swap', ensurePlaying);
// The Start hero hides the video (<html data-hero-active>, global.css) and shows it again.
new MutationObserver(ensurePlaying).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-hero-active'],
});
// A first interaction lets Safari play it where autoplay was held back.
for (const type of ['pointerdown', 'touchstart', 'keydown', 'wheel'] as const) {
  document.addEventListener(type, ensurePlaying, { capture: true, passive: true });
}

/* ---------- Video / still glow switch ---------- */

const STORE_KEY = 'raydentec:bg';
const FADE_MS = 600;
let pauseTimer = 0;

const video = () => document.getElementById('bgVideo') as HTMLVideoElement | null;
const isGlow = () => getRootState('bg') === 'glow';

function syncButtons() {
  const on = !isGlow();
  document.querySelectorAll<HTMLButtonElement>('[data-bg-toggle]').forEach((b) => {
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', on ? 'Turn off background animation' : 'Turn on background animation');
  });
}

function setGlow(glow: boolean, remember = true) {
  setRootState('bg', glow ? 'glow' : null);
  syncButtons();
  window.clearTimeout(pauseTimer);
  const v = video();
  if (v) {
    // Pause once the video has faded out (saves the decoding); play straight away to fade in.
    if (glow) pauseTimer = window.setTimeout(() => v.pause(), FADE_MS);
    else ensurePlaying();
  }
  if (!remember) return;
  try {
    if (glow) localStorage.setItem(STORE_KEY, 'glow');
    else localStorage.removeItem(STORE_KEY);
  } catch {
    // Storage unavailable (private mode, blocked): the choice lasts for this visit only.
  }
}

document.addEventListener('click', (e) => {
  if ((e.target as Element | null)?.closest('[data-bg-toggle]')) setGlow(!isGlow());
});

// Restore the remembered choice on the first page (the root state carries it after that).
let restored = false;
function restore() {
  if (restored) {
    syncButtons();
    return;
  }
  restored = true;
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORE_KEY);
  } catch {
    stored = null;
  }
  if (stored === 'glow') {
    // At once, without a fade, so the page doesn't open on the video first.
    document.documentElement.classList.add('bg-instant');
    setGlow(true, false);
    requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove('bg-instant')));
  } else {
    syncButtons();
  }
}

document.addEventListener('astro:page-load', init);
document.addEventListener('astro:page-load', restore);
