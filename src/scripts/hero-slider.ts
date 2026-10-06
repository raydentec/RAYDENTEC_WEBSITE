/**
 * Start hero image slider (StartHero.astro). The slides sit side by side in a track that
 * scrolls and snaps sideways — swipe, trackpad or Shift+wheel, and ← / → while the hero
 * is in view. The track holds a copy of the last slide before the first and a copy of the
 * first after the last: scrolling on to a copy jumps to the real slide it shows, so the
 * slider goes round both ways (the first's left neighbour is the last) without rewinding.
 * Every INTERVAL_MS it scrolls on to the next slide. The slide at rest is the current one:
 * its indicator line is lit; clicking a line scrolls to that slide. Switching by hand
 * (swipe, line, key) restarts the timer.
 *
 * The timer keeps running while the pointer is over the hero and while the explore row
 * is in view. It stops while the slider or the page is being scrolled (not by the slider
 * itself) and starts again from the beginning once scrolling has stopped. It also skips
 * while keyboard focus is in the hero (its indicator / links; leaving restarts it) and
 * while the tab is hidden. Reduced motion: no timer, and slides
 * switch without the smooth scroll. A single image: nothing to slide, no timer.
 */
import { getRootState, getScroller, mq, onPageLoad, onScrollerScroll, scrollBehavior } from './dom';

const INTERVAL_MS = 5000;
const SETTLE_MS = 90;
/** Page scrolling has stopped when no scroll event came for this long (no `scrollend`). */
const PAGE_REST_MS = 150;

let timer = 0;
let settleTimer = 0;
let pageRestTimer = 0;
/** Current slide (0-based, real slides only). */
let current = 0;
let held = false;
/** Slide the track is scrolling to by script (timer, line, key; -1 / count = a copy); null for the user's own scrolling. */
let target: number | null = null;

const slider = () => getScroller()?.querySelector<HTMLElement>('[data-slider]') ?? null;
const track = (root: HTMLElement) => root.querySelector<HTMLElement>('[data-slide-track]');
const count = (root: HTMLElement) => root.querySelectorAll('[data-slide]').length;
const looped = (root: HTMLElement) => count(root) > 1;
const dots = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>('[data-slide-dot]'));

/** Slide the track rests at: -1 = copy of the last, count = copy of the first. */
const position = (t: HTMLElement) => (t.clientWidth ? Math.round(t.scrollLeft / t.clientWidth) - 1 : 0);
/** Track offset of a slide (the copy of the last comes first). */
const left = (t: HTMLElement, index: number) => (index + 1) * t.clientWidth;

function scrollToSlide(root: HTMLElement, index: number) {
  const t = track(root);
  if (!t || !looped(root)) return;
  target = index;
  t.scrollTo({ left: left(t, index), behavior: scrollBehavior() });
}

function lightDot(root: HTMLElement, index: number) {
  dots(root).forEach((d, i) => (i === index ? d.setAttribute('aria-current', 'true') : d.removeAttribute('aria-current')));
}

/** The track has come to rest: take its slide as the current one. */
function settle(root: HTMLElement) {
  const t = track(root);
  if (!t || !looped(root)) return;
  const n = count(root);
  let index = position(t);
  // Scrolling by script: wait until it has arrived.
  if (target !== null && index !== target) return;
  const byHand = target === null;
  target = null;
  // Scrolled by hand: the timer starts again now that the track rests (also on the same slide).
  if (byHand) restart();
  // On a copy: jump to the real slide it shows (they look the same).
  if (index < 0 || index >= n) {
    index = index < 0 ? n - 1 : 0;
    t.scrollTo({ left: left(t, index), behavior: 'instant' });
  }
  lightDot(root, index);
  current = index;
}

function restart() {
  window.clearInterval(timer);
  const root = slider();
  if (!root || !looped(root) || mq.reducedMotion.matches) return;
  timer = window.setInterval(() => {
    const r = slider();
    if (!r || held || document.hidden) return;
    scrollToSlide(r, current + 1);
  }, INTERVAL_MS);
}

// Track scrolls (scroll events don't bubble): light the line under way, settle once it rests.
document.addEventListener(
  'scroll',
  (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement) || !t.matches('[data-slide-track]')) return;
    const root = t.closest<HTMLElement>('[data-slider]');
    if (!root || !looped(root)) return;
    // Scrolled by hand: no timer until the track rests (settle).
    if (target === null) window.clearInterval(timer);
    const n = count(root);
    lightDot(root, (position(t) + n) % n);
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => settle(root), SETTLE_MS);
  },
  { capture: true, passive: true },
);
document.addEventListener(
  'scrollend',
  (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement) || !t.matches('[data-slide-track]')) return;
    const root = t.closest<HTMLElement>('[data-slider]');
    if (!root) return;
    window.clearTimeout(settleTimer);
    settle(root);
  },
  { capture: true },
);

// Page scrolled (up / down): no timer until it rests.
onScrollerScroll(() => {
  if (!slider()) return;
  window.clearInterval(timer);
  window.clearTimeout(pageRestTimer);
  pageRestTimer = window.setTimeout(restart, PAGE_REST_MS);
});

// The user takes over (touch, wheel, pointer on the track): stop waiting for a script scroll.
for (const type of ['touchstart', 'wheel', 'pointerdown'] as const) {
  document.addEventListener(
    type,
    (e) => {
      if ((e.target as Element | null)?.closest('[data-slide-track]')) target = null;
    },
    { capture: true, passive: true },
  );
}

// Bound once on document: keyboard focus in the hero holds the timer (a line clicked with
// the mouse keeps focus but doesn't hold it).
document.addEventListener('focusin', (e) => {
  const el = e.target as Element | null;
  if (el?.closest('[data-slider]') && el.matches(':focus-visible')) held = true;
});
document.addEventListener('focusout', (e) => {
  const root = (e.target as Element | null)?.closest('[data-slider]');
  if (!root || root.contains(e.relatedTarget as Node | null)) return;
  held = false;
  restart();
});

document.addEventListener('click', (e) => {
  const dot = (e.target as Element | null)?.closest<HTMLElement>('[data-slide-dot]');
  const root = dot?.closest<HTMLElement>('[data-slider]');
  if (!dot || !root) return;
  scrollToSlide(root, dots(root).indexOf(dot));
  restart();
});

// ← / → while the hero is in view (the Games rows' keys, scripts/game-rows.ts, act on the
// explore row once that is selected). Past either end they run on via the copies.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (getRootState('mmenu') === 'open' || getRootState('heroActive') === null) return;
  const el = e.target as HTMLElement;
  if (el.closest('input, textarea, select, [contenteditable], [data-row]')) return;
  const root = slider();
  if (!root || !looped(root)) return;
  e.preventDefault();
  scrollToSlide(root, current + (e.key === 'ArrowRight' ? 1 : -1));
  restart();
});

/** Rest the track on the current slide at once (page load, resize: slide width = track width). */
function place(root: HTMLElement) {
  const t = track(root);
  if (!t || !looped(root)) return;
  t.scrollTo({ left: left(t, current), behavior: 'instant' });
}

window.addEventListener('resize', () => {
  const root = slider();
  if (root) place(root);
});

document.addEventListener('astro:before-swap', () => {
  window.clearInterval(timer);
  window.clearTimeout(pageRestTimer);
});

onPageLoad(() => {
  window.clearInterval(timer);
  current = 0;
  held = false;
  target = null;
  const root = slider();
  if (!root) return;
  place(root);
  // The copies become snap points now (StartHero.astro).
  track(root)?.setAttribute('data-ready', '');
  restart();
});
