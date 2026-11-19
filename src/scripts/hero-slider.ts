/**
 * Start hero image slider (StartHero.astro). The slides sit side by side in a track that
 * scrolls and snaps sideways — swipe, and ← / → while the hero is in view. Sideways wheel /
 * trackpad / Shift+wheel input doesn't scroll the track natively: each gesture switches
 * one slide by script (as the indicator lines do), and the rest of the gesture (further
 * notches, trackpad momentum) is ignored until the input has stopped for INPUT_REST_MS.
 * (Natively, the browser's wheel snapping could carry on after the jump off a copy below
 * and switch a second time.) The track holds a copy of the last slide before the first and a copy of the
 * first after the last: scrolling on to a copy jumps to the real slide it shows, so the
 * slider goes round both ways (the first's left neighbour is the last) without rewinding.
 * The jump waits until the track truly rests on the copy: snapped into place, and no finger
 * down (a swipe could otherwise carry on from the new position).
 * Every INTERVAL_MS it scrolls on to the next slide. The slide at rest is the current one:
 * its indicator line is lit; clicking a line scrolls to that slide, the arrow buttons to
 * the previous / next one. Switching by hand (swipe, line, arrow, key) restarts the timer.
 *
 * The timer keeps running while the pointer is over the hero and while the explore row
 * is in view. It stops while the slider or the page is being scrolled (not by the slider
 * itself) and starts again from the beginning once scrolling has stopped. It also skips
 * while keyboard focus is in the hero (its indicator / links; leaving restarts it) and
 * while the tab is hidden. Reduced motion: no timer, and slides
 * switch without the smooth scroll. A single image: nothing to slide, no timer.
 *
 * Switches by script (timer, lines, arrows, keys, wheel) glide by script too, not with
 * scrollTo's smooth behaviour: its speed and easing are the browser's own — long and soft
 * in Chrome, short and abrupt in Firefox / Safari. The glide (GLIDE_EASE: fitted to
 * Chrome's; GLIDE_MS longer) steps scrollLeft every frame with snapping paused
 * (data-gliding, StartHero.astro), so it looks the same everywhere. Touching the track
 * stops it.
 */
import { CHROME_EASE, getRootState, getScroller, mq, onPageLoad, onScrollerScroll } from './dom';

const INTERVAL_MS = 5000;
const SETTLE_MS = 90;
/** Page scrolling has stopped when no scroll event came for this long (no `scrollend`). */
const PAGE_REST_MS = 150;
/** A wheel / trackpad gesture (incl. momentum) has ended when no event came for this long. */
const INPUT_REST_MS = 200;
/** Sideways wheel travel that switches a slide. */
const WHEEL_STEP_PX = 30;
/** Script glide: duration (Chrome's smooth scroll takes ~625ms) and easing (cubic-bezier 0.4, 0, 0, 1, as Chrome's). */
const GLIDE_MS = 1000;
const GLIDE_EASE = CHROME_EASE;

let timer = 0;
let settleTimer = 0;
let pageRestTimer = 0;
/** Current slide (0-based, real slides only). */
let current = 0;
let held = false;
/** Slide the track is scrolling to by script (timer, line, key; -1 / count = a copy); null for the user's own scrolling. */
let target: number | null = null;
/** A finger is on the track. */
let touching = false;
/** Current wheel gesture: sideways travel so far, and whether it has switched a slide. */
let wheelSum = 0;
let wheelDone = false;
let wheelRestTimer = 0;
/** Running script glide (requestAnimationFrame id), 0 when none. */
let glideFrame = 0;
let glideTrack: HTMLElement | null = null;

/** Stop a running glide where it is; snapping takes over again. */
function stopGlide() {
  if (!glideFrame) return;
  cancelAnimationFrame(glideFrame);
  glideFrame = 0;
  delete glideTrack?.dataset.gliding;
  glideTrack = null;
}

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
  // A running glide hands over where it is, snapping still paused (resuming it here would
  // pull the track back to a slide first).
  cancelAnimationFrame(glideFrame);
  glideFrame = 0;
  target = index;
  const to = left(t, index);
  const from = t.scrollLeft;
  if (mq.reducedMotion.matches || Math.abs(to - from) < 1) {
    delete t.dataset.gliding;
    glideTrack = null;
    t.scrollTo({ left: to, behavior: 'instant' });
    return;
  }
  // Glide by script (see top); settle once it has arrived.
  t.dataset.gliding = '';
  glideTrack = t;
  const start = performance.now();
  const frame = (now: number) => {
    const p = Math.min(1, (now - start) / GLIDE_MS);
    t.scrollTo({ left: from + (to - from) * GLIDE_EASE(p), behavior: 'instant' });
    if (p < 1) {
      glideFrame = requestAnimationFrame(frame);
      return;
    }
    glideFrame = 0;
    glideTrack = null;
    delete t.dataset.gliding;
    window.clearTimeout(settleTimer);
    settle(root);
  };
  glideFrame = requestAnimationFrame(frame);
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
  // On a copy: jump only once the track rests there for good (see top).
  if (index < 0 || index >= n) {
    if (touching) return; // settles again on touchend
    if (Math.abs(t.scrollLeft - left(t, index)) > 2) return; // still snapping: more scroll events follow
  }
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

/** Previous / next slide (wheel gesture, arrow buttons): from the slide a running switch
 * is heading to; not while it heads to a copy (wait for the jump off it). */
function step(root: HTMLElement, by: number) {
  const from = target ?? current;
  if (from < 0 || from >= count(root)) return;
  scrollToSlide(root, from + by);
  restart();
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
    if (glideFrame) return; // the glide settles when it arrives
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
    if (!root || glideFrame) return; // each glide step can end in a scrollend
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

// The user takes over (touch, pointer on the track): stop a glide / waiting for a script scroll.
for (const type of ['touchstart', 'pointerdown'] as const) {
  document.addEventListener(
    type,
    (e) => {
      if (!(e.target as Element | null)?.closest('[data-slide-track]')) return;
      stopGlide();
      target = null;
      if (type === 'touchstart') touching = true;
    },
    { capture: true, passive: true },
  );
}

// Sideways wheel / trackpad over the track: one slide per gesture, by script (see top).
// Vertical wheel goes on to the page.
document.addEventListener(
  'wheel',
  (e) => {
    const root = (e.target as Element | null)?.closest('[data-slide-track]')?.closest<HTMLElement>('[data-slider]');
    if (!root || !looped(root) || e.ctrlKey) return;
    const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
    if (!dx) return;
    e.preventDefault();
    window.clearTimeout(wheelRestTimer);
    wheelRestTimer = window.setTimeout(() => {
      wheelSum = 0;
      wheelDone = false;
    }, INPUT_REST_MS);
    if (wheelDone) return;
    wheelSum += e.deltaMode === WheelEvent.DOM_DELTA_LINE ? dx * 16 : dx;
    if (Math.abs(wheelSum) < WHEEL_STEP_PX) return;
    wheelDone = true;
    step(root, Math.sign(wheelSum));
  },
  { capture: true, passive: false },
);
// Finger lifted: settle again (a jump onto the real slide may have been waiting).
for (const type of ['touchend', 'touchcancel'] as const) {
  document.addEventListener(
    type,
    (e) => {
      if (!touching || (e as TouchEvent).touches.length) return;
      touching = false;
      const root = slider();
      if (!root) return;
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => settle(root), SETTLE_MS);
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
  const arrow = (e.target as Element | null)?.closest<HTMLElement>('[data-slide-prev], [data-slide-next]');
  const arrowRoot = arrow?.closest<HTMLElement>('[data-slider]');
  if (arrow && arrowRoot) return step(arrowRoot, arrow.matches('[data-slide-prev]') ? -1 : 1);
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
  stopGlide();
  target = null;
  t.scrollTo({ left: left(t, current), behavior: 'instant' });
}

window.addEventListener('resize', () => {
  const root = slider();
  if (root) place(root);
});

document.addEventListener('astro:before-swap', () => {
  stopGlide();
  window.clearInterval(timer);
  window.clearTimeout(pageRestTimer);
});

onPageLoad(() => {
  window.clearInterval(timer);
  current = 0;
  held = false;
  target = null;
  touching = false;
  const root = slider();
  if (!root) return;
  place(root);
  // The copies become snap points now (StartHero.astro).
  track(root)?.setAttribute('data-ready', '');
  restart();
});
