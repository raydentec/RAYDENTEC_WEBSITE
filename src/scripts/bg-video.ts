/**
 * Background video (HANDOFF §2.1): load only the clip that matches the layout —
 * landscape ≥1024px, portrait below — and never load it with reduced motion.
 * The <video> is persisted across navigation, so this runs once.
 *
 * Background switch (BgToggle.astro): <html data-bg="glow"> fades the video out and a still
 * blue glow in (global.css); the video is paused once faded out and played again when
 * switched back. The choice is remembered on this device (localStorage, when available).
 */
import { getRootState, setRootState } from './dom';

const DESKTOP = { src: '/assets/video/lightning-desktop.mp4', poster: '/assets/video/lightning-desktop-poster.jpg' };
const MOBILE = { src: '/assets/video/lightning-mobile.mp4', poster: '/assets/video/lightning-mobile-poster.jpg' };

function init() {
  const v = document.getElementById('bgVideo') as HTMLVideoElement | null;
  if (!v || v.dataset.init) return;
  v.dataset.init = '1';
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; // never load

  const mq = matchMedia('(min-width: 1024px)');
  const pick = () => {
    const clip = mq.matches ? DESKTOP : MOBILE;
    v.poster = clip.poster;
    if (v.getAttribute('src') !== clip.src) {
      v.src = clip.src;
      v.play().catch(() => {});
    }
  };
  pick();
  mq.addEventListener('change', pick);
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
    else if (v.getAttribute('src')) v.play().catch(() => {});
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
