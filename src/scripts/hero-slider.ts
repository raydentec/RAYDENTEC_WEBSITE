/**
 * Start hero image slider (StartHero.astro). The slides sit side by side in a track that
 * scrolls and snaps sideways — swipe (stopping at the next slide, scroll-snap-stop), and
 * ← / → while the hero is in view (one slide per press). A touch swipe moves one slide,
 * decided when let go (`swipe`). Every switch counts at once: its line lights. While a switch
 * is under way (`switching`: the glide to its slide) all input is ignored — arrows, keys,
 * lines, wheel, touch (the track can't be panned meanwhile: data-switching, StartHero.astro) —
 * the next switch can only start once it has finished. Sideways wheel /
 * trackpad / Shift+wheel input doesn't scroll the track natively: each gesture switches
 * one slide by script (as the indicator lines do), and the rest of the gesture (further
 * notches, trackpad momentum) is ignored until the next gesture (dom.ts wheelGesture).
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
 * doesn't stop it (see `switching`).
 */
import {
  CHROME_EASE,
  SCRIPT_GLIDES,
  stopEdgeBounce,
  releaseEase,
  releaseMomentum,
  releaseSpeed,
  stopMomentum,
  swipeDirection,
  touchedRecently,
  getRootState,
  getScroller,
  mq,
  onPageLoad,
  onScrollerScroll,
  wheelAxis,
  wheelGesture,
} from './dom';
import { bindIosSwipe, IOS_TOUCH } from './ios-swipe';

const INTERVAL_MS = 5000;
const SETTLE_MS = 90;
/** Page scrolling has stopped when no scroll event came for this long (no `scrollend`). */
const PAGE_REST_MS = 150;
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
/**
 * Touch (phones): the track follows the finger natively (its snapping paused meanwhile, its
 * line left as it is); let go, it moves one slide at most — to the next or previous one of
 * the slide it counts from (`base`: the one a switch still under way heads to, else the
 * current one) when swiped far enough for its speed (a fast swipe a little, a slow drag past
 * half the slide: dom.ts swipeDirection), else back to it — by script, the browser's own fling
 * stopped first (dom.ts stopMomentum). Its line changes then.
 */
let swipe: { base: number; left0: number } | null = null;

/** Presses (±1 each) waiting to go on past the copy a glide is heading to (step). */
let pending = 0;
/** Current wheel gesture: sideways travel so far, and whether it has switched a slide. */
let wheelSum = 0;
let wheelDone = false;
/** The wheel gesture (dom.ts wheelGesture) wheelSum / wheelDone belong to. */
let wheelOf = -1;
/** Running script glide (requestAnimationFrame id), 0 when none. */
let glideFrame = 0;
let glideTrack: HTMLElement | null = null;

/** A switch is under way (a glide to its slide): input is ignored until it has finished (see top). */
const switching = () => glideFrame !== 0;
function markSwitching(t: HTMLElement | null, on: boolean) {
  if (t) t.toggleAttribute('data-switching', on);
}

/** Stop a running glide where it is; snapping takes over again. */
function stopGlide() {
  pending = 0;
  releaseMomentum(slider()?.querySelector<HTMLElement>('[data-slide-track]')); // scrollable by the user again
  if (!glideFrame) return;
  cancelAnimationFrame(glideFrame);
  glideFrame = 0;
  delete glideTrack?.dataset.gliding;
  markSwitching(glideTrack, false);
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

/** `v0`: the speed the track is moving at (a touch swipe let go), carried on smoothly (dom.ts releaseEase). */
function scrollToSlide(root: HTMLElement, index: number, v0 = 0) {
  const t = track(root);
  if (!t || !looped(root)) return;
  // After touch (a swipe let go, a tapped line / arrow): a fling still under way is stopped
  // first, or it fought the glide (jumpy).
  if (touchedRecently()) stopMomentum(t);
  // A running glide hands over where it is, snapping still paused (resuming it here would
  // pull the track back to a slide first).
  cancelAnimationFrame(glideFrame);
  glideFrame = 0;
  target = index;
  lightDot(root, ((index % count(root)) + count(root)) % count(root)); // the switch counts at once
  const to = left(t, index);
  const from = t.scrollLeft;
  if (mq.reducedMotion.matches || Math.abs(to - from) < 1) {
    delete t.dataset.gliding;
    markSwitching(t, false);
    glideTrack = null;
    t.scrollTo({ left: to, behavior: 'instant' });
    releaseMomentum(t);
    return;
  }
  // Glide by script (see top); settle once it has arrived.
  t.dataset.gliding = '';
  markSwitching(t, true);
  glideTrack = t;
  // From where it is on the first frame (a touch swipe's fling gets one frame in first, see
  // dom.ts glideScroll): no jump back.
  let start = 0;
  let sx = from;
  let glide = { ms: GLIDE_MS, ease: GLIDE_EASE };
  const frame = (now: number) => {
    if (!start) {
      start = now;
      sx = t.scrollLeft;
      if (v0) glide = releaseEase(to - sx, v0, GLIDE_MS);
    }
    const p = Math.min(1, (now - start) / glide.ms);
    t.scrollTo({ left: sx + (to - sx) * glide.ease(p), behavior: 'instant' });
    // Presses waiting to go on past the copy: the track is close enough to it now.
    if (pending && canLeaveCopy(root)) {
      flushPending(root);
      return;
    }
    if (p < 1) {
      glideFrame = requestAnimationFrame(frame);
      return;
    }
    glideFrame = 0;
    glideTrack = null;
    delete t.dataset.gliding;
    markSwitching(t, false);
    releaseMomentum(t); // arrived: the user can scroll it again
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
  if (!t || !looped(root) || touching) return; // settles again on touchend
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
  pending = 0;
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

/**
 * Previous / next slide (arrow buttons, ← / → keys, wheel gesture): from the slide a running
 * switch is heading to, so quick presses add up instead of restarting the glide to the
 * same slide. Heading to a copy, a press can't go on from it (there's nothing beyond):
 * once the track is between the copy and its neighbour, it moves instantly to the same
 * spot by the real slide the copy shows — the two look the same — and carries on from
 * there. Presses that come before the track gets that far wait (pending) until it does.
 */
function step(root: HTMLElement, by: number) {
  if (switching()) return; // the next switch only once this one has finished (see top)
  const from = target ?? current;
  if (from < 0 || from >= count(root)) {
    pending += by;
    if (canLeaveCopy(root)) flushPending(root);
  } else scrollToSlide(root, from + by);
  restart();
}

/** Heading to a copy, the track is between it and its neighbour: it can move to the real slide. */
function canLeaveCopy(root: HTMLElement) {
  const t = track(root);
  if (!t || target === null) return false;
  const n = count(root);
  if (target >= n) return t.scrollLeft >= left(t, n - 1) - 1;
  if (target < 0) return t.scrollLeft <= left(t, 0) + 1;
  return false;
}

/** Move from the copy's side to the real slide's (instantly, looks the same) and go on by the waiting presses. */
function flushPending(root: HTMLElement) {
  const t = track(root);
  if (!t || target === null) return;
  const n = count(root);
  const forward = target >= n;
  cancelAnimationFrame(glideFrame); // snapping stays paused for the glide below
  glideFrame = 0;
  t.scrollTo({ left: t.scrollLeft + (forward ? -n : n) * t.clientWidth, behavior: 'instant' });
  const from = forward ? 0 : n - 1;
  // Past the next copy at most; any further presses wait there again.
  const to = Math.max(-1, Math.min(n, from + pending));
  pending -= to - from;
  scrollToSlide(root, to);
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
    if (touching) return; // its line changes when let go (see swipe)
    // The line of the slide a switch heads to (it counts at once), else the one under way.
    lightDot(root, ((target ?? position(t)) + n) % n);
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
      // A touch also fires pointerdown (first): touchstart handles it, with the target intact.
      if (type === 'pointerdown' && (e as PointerEvent).pointerType === 'touch') return;
      if (type === 'touchstart' && IOS_TOUCH) return; // iOS: ios-swipe.ts (below)
      if (switching()) return; // ignored: the switch under way goes on (see top)
      const root = slider();
      const heading = target;
      stopGlide();
      target = null;
      if (type === 'touchstart' && root) {
        touching = true;
        const n = count(root);
        const base = heading === null ? current : (heading + n) % n;
        const t = track(root);
        // Mid-switch: snapping paused until let go (it would snap back meanwhile); from rest it
        // stays on, so Chrome's own fling (a frame before the release glide) aims at the next
        // slide instead of flying past it.
        // (WebKit: always paused — its own snapping interfered from the drag's start.)
        if (heading !== null || SCRIPT_GLIDES) t?.setAttribute('data-gliding', '');
        swipe = { base, left0: t?.scrollLeft ?? 0 };
      }
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
    // Only sideways gestures (dom.ts wheelAxis); vertical ones go to the page (wheel.ts).
    if (!root || !looped(root) || e.ctrlKey || wheelAxis() !== 'x') return;
    e.preventDefault();
    const dx = e.deltaX || (e.shiftKey ? e.deltaY : 0);
    if (!dx) return;
    if (wheelGesture() !== wheelOf) {
      wheelOf = wheelGesture();
      wheelSum = 0;
      wheelDone = false;
    }
    // During a switch: ignored — the whole gesture (it doesn't switch once that one ends).
    if (switching()) wheelDone = true;
    if (wheelDone) return;
    wheelSum += e.deltaMode === WheelEvent.DOM_DELTA_LINE ? dx * 16 : dx;
    if (Math.abs(wheelSum) < WHEEL_STEP_PX) return;
    wheelDone = true;
    step(root, Math.sign(wheelSum));
  },
  { capture: true, passive: false },
);
// iOS touch: the drag by script, one slide at most (ios-swipe.ts); let go, the glide.
let iosHeading: number | null = null;
bindIosSwipe('[data-slide-track]', {
  start(t) {
    const root = t.closest<HTMLElement>('[data-slider]');
    if (!root || !looped(root) || switching()) return null; // during a switch: ignored (see top)
    const n = count(root);
    iosHeading = target;
    const base = target === null ? current : ((target % n) + n) % n;
    stopGlide();
    target = null;
    touching = true; // its line stays as it is until let go; no settling meanwhile
    t.dataset.gliding = '';
    return { base, min: left(t, base - 1), max: left(t, base + 1), step: t.clientWidth };
  },
  release(t, base, dir, v0) {
    const root = t.closest<HTMLElement>('[data-slider]');
    touching = false;
    if (!root) return;
    scrollToSlide(root, base + dir, v0);
    restart();
  },
  cancel(t, base) {
    const root = t.closest<HTMLElement>('[data-slider]');
    touching = false;
    delete t.dataset.gliding;
    if (root && iosHeading !== null) scrollToSlide(root, base); // a switch it interrupted: on with it
    iosHeading = null;
  },
});

// Finger lifted: settle again (a jump onto the real slide may have been waiting).
for (const type of ['touchend', 'touchcancel'] as const) {
  document.addEventListener(
    type,
    (e) => {
      if (!touching || (e as TouchEvent).touches.length) return;
      touching = false;
      const root = slider();
      const sw = swipe;
      swipe = null;
      const t = root && track(root);
      if (!root || !t || !sw) return;
      const f = (e as TouchEvent).changedTouches[0];
      const moved = t.scrollLeft - sw.left0;
      // Moved sideways, or a switch was under way: one slide at most (see swipe).
      if (Math.abs(moved) >= 1 || sw.base !== current) {
        // Far enough for its speed (dom.ts swipeDirection): a fast swipe a little, a slow
        // drag past half the slide.
        const dir = swipeDirection(f, moved, t.clientWidth);
        stopMomentum(t);
        scrollToSlide(root, sw.base + dir, releaseSpeed());
        restart();
        return;
      }
      delete t.dataset.gliding; // a tap / vertical drag: as it was
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
  if (!dot || !root || switching()) return; // during a switch: ignored (see top)
  scrollToSlide(root, dots(root).indexOf(dot));
  restart();
});

// ← / → while the hero is in view (the Games rows' keys, scripts/game-rows.ts, act on the
// explore row once that is selected). Past either end they run on via the copies. A glide
// decides at once (dom.ts markArriving): heading back to the hero, they switch slides
// already; heading away from it (to the explore row), they're the row's already.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (getRootState('mmenu') === 'open') return;
  const root = slider();
  if (!root || !looped(root)) return;
  const arriving = getScroller()?.querySelector('[data-arriving]');
  if (arriving ? arriving !== root : getRootState('heroActive') === null) return;
  const el = e.target as HTMLElement;
  if (el.closest('input, textarea, select, [contenteditable], [data-row]')) return;
  e.preventDefault();
  if (e.repeat) return; // one slide per press: holding the key doesn't run on
  step(root, e.key === 'ArrowRight' ? 1 : -1); // as the arrow buttons
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
  const heroTrack = slider()?.querySelector<HTMLElement>('[data-slide-track]');
  if (heroTrack && !IOS_TOUCH) stopEdgeBounce(heroTrack); // no rubber-band at the ends (dom.ts; iOS: ios-swipe.ts)
  current = 0;
  held = false;
  target = null;
  touching = false;
  swipe = null;
  const root = slider();
  if (!root) return;
  place(root);
  // The copies become snap points now (StartHero.astro).
  track(root)?.setAttribute('data-ready', '');
  restart();
});
