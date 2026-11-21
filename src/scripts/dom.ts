/**
 * Shared helpers for the shell scripts.
 *
 * Scripts are bundled modules, so their top level runs once per full page load.
 * Listeners on document/window and on `transition:persist` elements are bound
 * there; anything inside the swapped content column (#scroller) is re-read on
 * every `astro:page-load`.
 */

export const mq = {
  /** A phone (narrow, touch): vertical touch moves the column by script (wheel.ts "Touch on phones"). */
  touchColumn: matchMedia('(max-width: 767px) and (pointer: coarse)'),
  /** A phone turned sideways: the page is covered by the rotate note (Shell.astro .rotate-note). */
  rotateNote: matchMedia('(orientation: landscape) and (pointer: coarse) and (max-height: 540px)'),
  desktop: matchMedia('(min-width: 1280px)'),
  mobile: matchMedia('(max-width: 767px)'),
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)'),
};

export const getScroller = () => document.getElementById('scroller');

/**
 * Start page: container 0 is the hero (StartHero.astro), container 1 the explore row —
 * the first one with the usual container chrome (scripts/start.ts).
 */
export const isStartPage = (doc: Document = document) => doc.getElementById('scroller')?.dataset.page === 'start';

export const scrollBehavior = (): ScrollBehavior => (mq.reducedMotion.matches ? 'auto' : 'smooth');

/** CSS-style cubic-bezier easing (x1, x2 in 0…1): progress for a time fraction. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const at = (a: number, b: number, u: number) => 3 * (1 - u) ** 2 * u * a + 3 * (1 - u) * u ** 2 * b + u ** 3;
  return (x: number) => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (at(x1, x2, mid) < x) lo = mid;
      else hi = mid;
    }
    return at(y1, y2, (lo + hi) / 2);
  };
}

/**
 * Chrome's own smooth-scroll curve (fitted to its scrollTo({ behavior: 'smooth' })), for
 * scroll glides done by script so they look the same in every browser (wheel.ts,
 * hero-slider.ts).
 */
export const CHROME_EASE = cubicBezier(0.4, 0, 0, 1);

/** Chromium (Chrome, Edge, Opera…): only it has navigator.userAgentData. */
const NATIVE_SMOOTH = 'userAgentData' in navigator;
/** Not Chromium (WebKit, Firefox): glides by script, and touch tweaks of their own (game-rows.ts, hero-slider.ts). */
export const SCRIPT_GLIDES = !NATIVE_SMOOTH;
/** Default glide length (≈ Chrome's own smooth scroll over a screen). */
export const GLIDE_MS = 625;

const glides = new WeakMap<HTMLElement, () => void>();

/**
 * Smooth scroll of `el` to `to` — the one way the column and the sideways rows switch
 * container / game (click, SCROLL, keys, wheel gestures), so every switch looks alike:
 *   - Chromium: the browser's own smooth scroll — smooth (run off the main thread) and
 *     already on CHROME_EASE; a glide stepped by script stuttered there, the page being
 *     repainted each frame.
 *   - Safari / Firefox: their own is short and abrupt, so a glide by script — `ms` on
 *     CHROME_EASE, scrollTo every frame with snapping paused (<el data-gliding>: CSS turns
 *     scroll-snap-type off for the column and the row / hero tracks).
 * Reduced motion: at once. A new glide on the same element takes over from where the
 * running one is (snapping stays paused, or the track would be pulled to a snap point
 * first). `onDone` runs once it has arrived; not after stopGlide().
 */
export function glideScroll(
  el: HTMLElement,
  to: { left?: number; top?: number },
  onDone?: () => void,
  ms = GLIDE_MS,
  /** By script even in Chromium: while the browser's own snapping of a touch swipe is
      still pending there, it pulled the track back after a native smooth scroll. */
  byScript = false,
  /** Speed (px/ms, along the scroll; + = increasing) it is already moving at — a touch swipe
      let go: the glide carries it on smoothly (releaseEase), by script. */
  v0 = 0,
) {
  glides.get(el)?.(); // hand over: stop the running one, keep data-gliding for now
  const x0 = el.scrollLeft;
  const y0 = el.scrollTop;
  const x1 = to.left ?? x0;
  const y1 = to.top ?? y0;
  let frame = 0;
  let fallback = 0;
  let over = false;
  const cleanUp = () => {
    over = true;
    cancelAnimationFrame(frame);
    window.clearTimeout(fallback);
    el.removeEventListener('scrollend', onEnd);
    if (glides.get(el) === handOver) glides.delete(el);
  };
  const finish = () => {
    if (over) return;
    cleanUp();
    delete el.dataset.gliding;
    releaseMomentum(el);
    onDone?.();
  };
  const onEnd = () => {
    if (Math.abs(el.scrollLeft - x1) <= 2 && Math.abs(el.scrollTop - y1) <= 2) finish();
  };
  // Taken over by another glide: stop without resuming snapping.
  const handOver = () => cleanUp();
  glides.set(el, handOver);

  if (mq.reducedMotion.matches || (Math.abs(x1 - x0) < 1 && Math.abs(y1 - y0) < 1)) {
    el.scrollTo({ left: x1, top: y1, behavior: 'instant' });
    finish();
    return;
  }
  if (NATIVE_SMOOTH && !byScript && !v0) {
    delete el.dataset.gliding;
    el.addEventListener('scrollend', onEnd);
    fallback = window.setTimeout(finish, ms + 1000); // in case no scrollend comes
    el.scrollTo({ left: x1, top: y1, behavior: 'smooth' });
    return;
  }
  el.dataset.gliding = '';
  // From where it is on the glide's first frame: after a touch swipe Chrome's own fling gets
  // one frame in first (it can't be cancelled from the page); starting from before it, the
  // glide jumped back. That frame becomes part of the motion instead.
  let start = 0;
  let sx = x0;
  let sy = y0;
  let glide = releaseEase(0, 0, ms);
  const step = (now: number) => {
    if (!start) {
      start = now;
      sx = el.scrollLeft;
      sy = el.scrollTop;
      glide = releaseEase(Math.abs(x1 - sx) > Math.abs(y1 - sy) ? x1 - sx : y1 - sy, v0, ms);
    }
    const p = Math.min(1, (now - start) / glide.ms);
    const e = glide.ease(p);
    el.scrollTo({ left: sx + (x1 - sx) * e, top: sy + (y1 - sy) * e, behavior: 'instant' });
    if (p < 1) frame = requestAnimationFrame(step);
    else finish();
  };
  frame = requestAnimationFrame(step);
}

/**
 * Stop the browser's own scrolling of `el` (a touch fling still under way) for a glide by
 * script: not scrollable by the user until releaseMomentum — the glide's end, or a new touch
 * (stopGlide). Only for a moment wasn't enough in Chrome on Android: the fling ran on under
 * the glide (jerky) and, snapping back on at its end, carried the track on to the item after.
 * Scrolling it by script still works meanwhile.
 */
export function stopMomentum(el: HTMLElement) {
  // Chromium only: in WebKit it made the track jump straight to a snap point (and the glide,
  // writing the position every frame, stops the fling there by itself).
  if (!NATIVE_SMOOTH) return;
  el.style.overflowX = 'hidden';
  el.dataset.held = '';
}
export function releaseMomentum(el: HTMLElement | null | undefined) {
  if (!el || !('held' in el.dataset)) return;
  delete el.dataset.held;
  el.style.overflowX = '';
}

/** A touch came in the last TOUCH_RECENT_MS (any touch: a swipe, a tapped indicator line). */
const TOUCH_RECENT_MS = 1500;
let lastTouch = -Infinity;
document.addEventListener('touchstart', () => (lastTouch = performance.now()), { capture: true, passive: true });
export const touchedRecently = () => performance.now() - lastTouch < TOUCH_RECENT_MS;

/**
 * Where a touch swipe on a sideways track goes when let go (game-rows.ts, hero-slider.ts):
 * 1 / -1 to the next / previous item, 0 back to the one it started on. A fast swipe (the
 * finger moving at least SWIPE_FAST px/ms over its last SWIPE_SPEED_MS) needs only
 * SWIPE_FAST_SHARE of an item (`step`: the distance between items); a slow drag has to get
 * past SWIPE_SLOW_SHARE of one, or it springs back. The distance is the finger's sideways
 * travel — or the track's (`moved`) where that is more (touch moves held back while a
 * fling scrolls). Finger positions are kept from touchstart (all touches, see below).
 */
const SWIPE_FAST = 0.5;
const SWIPE_SPEED_MS = 100;
const SWIPE_FAST_SHARE = 0.15;
const SWIPE_SLOW_SHARE = 0.5;
let fingerAt: { x: number; y: number; t: number }[] = [];
document.addEventListener(
  'touchstart',
  (e) => {
    const f = e.touches[0];
    fingerAt = f ? [{ x: f.clientX, y: f.clientY, t: performance.now() }] : [];
  },
  { capture: true, passive: true },
);
document.addEventListener(
  'touchmove',
  (e) => {
    const f = e.touches[0];
    if (!f) return;
    fingerAt.push({ x: f.clientX, y: f.clientY, t: performance.now() });
    if (fingerAt.length > 24) fingerAt.splice(1, fingerAt.length - 24); // keep the start
  },
  { capture: true, passive: true },
);
/**
 * Easing for a glide over `distance` px that starts at `v0` px/ms (a touch swipe let go,
 * along the glide: + = towards its end): a cubic (Hermite) curve leaving at that speed and
 * coming smoothly to rest — so letting go doesn't drop the motion to a standstill for a
 * frame before the glide picks it up again (CHROME_EASE starts from rest). Its length is
 * what easing out from that speed takes, within RELEASE_MIN_MS…`maxMs`. Slow or backwards
 * releases (springing back) use CHROME_EASE over `maxMs`.
 */
const RELEASE_MIN_MS = 220;
const RELEASE_SLOW = 0.05;
export function releaseEase(distance: number, v0: number, maxMs: number) {
  const d = Math.abs(distance);
  const v = v0 * Math.sign(distance); // speed towards the glide's end
  if (d < 1 || v < RELEASE_SLOW) return { ms: maxMs, ease: CHROME_EASE };
  // Leaving at m0 × the average speed: 1.6 gives an ease-out with no overshoot (< 3).
  const ms = Math.min(maxMs, Math.max(RELEASE_MIN_MS, (1.6 * d) / v));
  const m0 = Math.min(3, (v * ms) / d);
  return { ms, ease: (u: number) => (u * u * u - 2 * u * u + u) * m0 + (3 * u * u - 2 * u * u * u) };
}

/** Speed (px/ms) a sideways track was moving at as the last touch swipe was let go (+ = scrolling on). */
let lastReleaseSpeed = 0;
export const releaseSpeed = () => lastReleaseSpeed;

/**
 * The scroll speed (px/ms; + = scrolling on: the finger going left / up) a touch drag had as
 * it was let go, along `axis`: over the finger's last SWIPE_SPEED_MS of movement, 0 if it had
 * rested longer than that before lifting. (Vertical touch on phones, wheel.ts.)
 */
export function touchVelocity(axis: 'x' | 'y') {
  const last = fingerAt[fingerAt.length - 1];
  if (!last || fingerAt.length < 2 || performance.now() - last.t > SWIPE_SPEED_MS) return 0;
  const ref = fingerAt.find((p) => last.t - p.t <= SWIPE_SPEED_MS && p !== last) ?? fingerAt[0];
  return -(axis === 'x' ? last.x - ref.x : last.y - ref.y) / Math.max(1, last.t - ref.t);
}
/** A fast release (|touchVelocity| at least SWIPE_FAST) needs this share of an item to switch; a slow one the other. */
export const swipeShare = (fast: boolean) => (fast ? SWIPE_FAST_SHARE : SWIPE_SLOW_SHARE);
export const SWIPE_FAST_SPEED = SWIPE_FAST;

export function swipeDirection(end: Touch | undefined, moved: number, step: number) {
  const start = fingerAt[0];
  if (!start || step <= 0) return 0;
  const now = performance.now();
  const last = fingerAt[fingerAt.length - 1];
  const x = end?.clientX ?? last.x;
  const y = end?.clientY ?? last.y;
  const dx = x - start.x;
  // + towards the next item (finger to the left; the track scrolling on).
  let dist = Math.abs(dx) > Math.abs(y - start.y) ? -dx : 0;
  if (Math.abs(moved) > Math.abs(dist)) dist = moved;
  // Speed as it was let go: over the finger's last SWIPE_SPEED_MS of movement — none if it
  // had rested longer than that before lifting; with no moves seen (held back while a fling
  // scrolled), over the whole drag.
  let speed: number;
  let velocity = 0; // the track's, signed (+ = scrolling on: finger to the left)
  if (fingerAt.length < 2) speed = Math.abs(dist) / Math.max(1, now - start.t);
  else if (now - last.t > SWIPE_SPEED_MS) speed = 0;
  else {
    const ref = fingerAt.find((p) => last.t - p.t <= SWIPE_SPEED_MS && p !== last) ?? start;
    velocity = -(last.x - ref.x) / Math.max(1, last.t - ref.t);
    speed = Math.abs(velocity);
  }
  lastReleaseSpeed = velocity;
  const need = step * (speed >= SWIPE_FAST ? SWIPE_FAST_SHARE : SWIPE_SLOW_SHARE);
  return Math.abs(dist) >= need ? Math.sign(dist) : 0;
}

/**
 * No rubber-band at the start of a sideways track in WebKit (iOS), overscroll-behavior
 * notwithstanding. The far end has room to spare there instead (html[data-glide-script]:
 * GameRow.astro, StartHero.astro) — dragging past the last item never reaches an edge, and
 * the release glides back. At the start (scroll position 0) that can't be done, so a drag
 * that begins there has its moves back past the start cancelled. Only for such drags: a
 * listener that can cancel moves makes the track's scrolling wait for the script (it
 * jittered at the start of every drag). Not in Chromium (no rubber-band; untouched).
 */
export function stopEdgeBounce(track: HTMLElement) {
  if (NATIVE_SMOOTH || track.dataset.noBounce) return;
  track.dataset.noBounce = '';
  let lastX = 0;
  let x0 = 0;
  let y0 = 0;
  let sideways: boolean | null = null; // decided by the drag's first clear move
  const guard = (e: TouchEvent) => {
    const f = e.touches[0];
    if (!f) return;
    if (sideways === null && Math.max(Math.abs(f.clientX - x0), Math.abs(f.clientY - y0)) >= 6) {
      sideways = Math.abs(f.clientX - x0) > Math.abs(f.clientY - y0);
    }
    const towardsStart = f.clientX > lastX; // finger to the right: the track would scroll back
    lastX = f.clientX;
    if (sideways && towardsStart && track.scrollLeft <= 1 && e.cancelable) e.preventDefault();
  };
  const unguard = () => {
    track.removeEventListener('touchmove', guard);
    track.removeEventListener('touchend', unguard);
    track.removeEventListener('touchcancel', unguard);
  };
  track.addEventListener(
    'touchstart',
    (e) => {
      if (track.scrollLeft > 1) return; // not at the start: nothing to guard
      lastX = x0 = e.touches[0]?.clientX ?? 0;
      y0 = e.touches[0]?.clientY ?? 0;
      sideways = null;
      track.addEventListener('touchmove', guard, { passive: false });
      track.addEventListener('touchend', unguard);
      track.addEventListener('touchcancel', unguard);
    },
    { passive: true },
  );
}

/** Stop a running glide of `el` where it is; snapping takes over again. */
export function stopGlide(el: HTMLElement) {
  releaseMomentum(el); // scrollable by the user again (a new touch)
  const stop = glides.get(el);
  if (!stop) return;
  stop();
  delete el.dataset.gliding;
}

/** A glide of `el` is running. */
export const isGliding = (el: HTMLElement) => glides.has(el);

/**
 * UI state lives in data-* attributes on <html> so CSS can react to it.
 * ClientRouter replaces <html>'s attributes on every swap, so re-apply them.
 */
const rootState = new Map<string, string | null>();

function applyRootState(key: string, value: string | null) {
  if (value === null) delete document.documentElement.dataset[key];
  else document.documentElement.dataset[key] = value;
}

export function setRootState(key: string, value: string | null) {
  rootState.set(key, value);
  applyRootState(key, value);
}

export const getRootState = (key: string) => rootState.get(key) ?? document.documentElement.dataset[key] ?? null;

document.addEventListener('astro:after-swap', () => rootState.forEach((v, k) => applyRootState(k, v)));

/**
 * While the window is being resized: <html data-resizing> (cleared 150ms after the last
 * resize event). The content column then follows the new size at once instead of animating
 * its width (Shell.astro) — animating across a breakpoint passed through layouts of neither
 * size (the Community tiles jumped between column counts).
 */
let resizeTimer = 0;
window.addEventListener('resize', () => {
  document.documentElement.setAttribute('data-resizing', '');
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => document.documentElement.removeAttribute('data-resizing'), 150);
});

/**
 * Wheel / trackpad gestures, shared by the column (wheel.ts), the sideways rows
 * (game-rows.ts) and the hero slider (hero-slider.ts), which each move one step per gesture
 * and swallow the rest of it (further notches, trackpad momentum).
 *
 * A gesture ends once the input has rested for GESTURE_REST_MS — or a new one starts while
 * the last one's momentum is still coming in: a fresh swipe speeds up again (momentum only
 * slows down). Without that, swiping again before the momentum had died away was swallowed
 * as part of the first gesture, and the controls seemed stuck until the trackpad went quiet.
 * A swipe's own start (it speeds up over its first events) doesn't count: only once the
 * gesture is REACCEL_AFTER_MS old, and only a clear jump (REACCEL_RATIO × the last few
 * events, at least REACCEL_MIN_PX).
 *
 * Its axis is decided by its first event (mostly sideways, or Shift+wheel → 'x'; else 'y')
 * and kept for all of it: the column only moves on 'y' gestures, the rows and the hero only
 * on 'x' ones — a diagonal swipe never switches both. Bound here, before their listeners
 * (dom.ts is evaluated first), so they read the state for the event at hand.
 */
const GESTURE_REST_MS = 200;
const REACCEL_AFTER_MS = 150;
const REACCEL_RATIO = 1.6;
const REACCEL_MIN_PX = 10;
let axis: 'x' | 'y' = 'y';
let gestureId = 0;
let lastWheel = -Infinity;
let gestureStart = -Infinity;
let recent: number[] = [];
document.addEventListener(
  'wheel',
  (e) => {
    const now = performance.now();
    const unit = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
    const dx = Math.abs(e.deltaX) * unit;
    const dy = Math.abs(e.deltaY) * unit;
    const size = Math.max(dx, dy);
    const before = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
    const rested = now - lastWheel > GESTURE_REST_MS;
    const reaccel =
      now - gestureStart > REACCEL_AFTER_MS && recent.length >= 3 && size >= REACCEL_MIN_PX && size > before * REACCEL_RATIO;
    if ((rested || reaccel) && size) {
      gestureId++;
      gestureStart = now;
      recent = [];
      axis = dx > dy || (e.shiftKey && !dx) ? 'x' : 'y';
    }
    if (size) recent = [...recent.slice(-2), size];
    lastWheel = now;
  },
  { capture: true, passive: true },
);
/** Axis of the current wheel / trackpad gesture (see above). */
export const wheelAxis = () => axis;
/** Number of the current wheel / trackpad gesture: a new one when it changes (see above). */
export const wheelGesture = () => gestureId;

/** Scroll events don't bubble; one capturing listener fans out scroller scrolls. */
type ScrollHandler = (scroller: HTMLElement) => void;
const scrollHandlers: ScrollHandler[] = [];
document.addEventListener(
  'scroll',
  (e) => {
    const target = e.target;
    if (target instanceof HTMLElement && target.id === 'scroller') scrollHandlers.forEach((h) => h(target));
  },
  { capture: true, passive: true },
);
export const onScrollerScroll = (handler: ScrollHandler) => scrollHandlers.push(handler);

export const onPageLoad = (handler: () => void) => document.addEventListener('astro:page-load', handler);

/** Distance (px) from the scroller's top edge to where containers snap. */
export function snapOffset(scroller: HTMLElement) {
  return parseFloat(getComputedStyle(scroller).scrollPaddingTop) || 0;
}

/**
 * The containers the column snaps between. On Games those are the sideways rows
 * ([data-row], scripts/game-rows.ts), not the games inside them. Containers hidden by
 * the Projects filter (scripts/project-filter.ts) are left out.
 */
export const containers = (scroller: HTMLElement) =>
  Array.from(scroller.querySelectorAll<HTMLElement>('[data-cf]:not([data-row] [data-cf])')).filter(
    (cf) => cf.getClientRects().length > 0,
  );

/**
 * A container's snap edge (viewport px): its top — or higher by its `scroll-margin-top`
 * when something above rides along with it (a Projects category headline and filter
 * buttons, scripts/project-filter.ts). CSS snapping honours the margin natively.
 */
export const snapTop = (cf: Element) =>
  cf.getBoundingClientRect().top - (parseFloat(getComputedStyle(cf).scrollMarginTop) || 0);

/**
 * Bottom of the area the containers show in (viewport px). Mobile: 16px above the bottom
 * controls (SCROLL / BACK TO TOP, the page menu bar — they cover the column's bottom; the
 * column's bottom padding keeps that much clear, Shell.astro); else the column's bottom.
 */
export function visibleBottom(scroller: HTMLElement) {
  const bottom = scroller.getBoundingClientRect().bottom;
  if (!mq.mobile.matches) return bottom;
  const tops = Array.from(document.querySelectorAll<HTMLElement>('[data-scroll-ctl], .mmenu__bar'))
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.height > 0)
    .map((r) => r.top - 16);
  return Math.min(bottom, ...tops);
}

/**
 * Scroll positions at which each container's snap edge (snapTop) sits on the snap line
 * (start); a container taller than the visible area (down to visibleBottom) can rest
 * anywhere from there down to where its bottom edge shows (end). A container with its own
 * empty space at the bottom for the controls ([data-bottom-space]: the mobile Start hero,
 * as the info area on other pages) counts down to the column's bottom instead.
 */
export function snapSpans(scroller: HTMLElement) {
  const line = scroller.getBoundingClientRect().top + snapOffset(scroller);
  const visible = visibleBottom(scroller);
  const columnBottom = scroller.getBoundingClientRect().bottom;
  const max = scroller.scrollHeight - scroller.clientHeight;
  return containers(scroller).map((cf) => {
    const start = Math.min(max, Math.max(0, scroller.scrollTop + (snapTop(cf) - line)));
    // Where its bottom edge reaches the visible bottom (from the top of the page, not the
    // snap line, for one that starts above it: the Start hero under the top bar).
    const bottom = cf.hasAttribute('data-bottom-space') ? columnBottom : visible;
    const end = Math.min(max, Math.max(start, scroller.scrollTop + cf.getBoundingClientRect().bottom - bottom));
    return { start, end };
  });
}

/**
 * The container a vertical glide (wheel / keys, click, SCROLL) is heading to, marked
 * [data-arriving] from the moment it starts: a sideways row's track (GameRow.astro) or the
 * Start hero's slides (StartHero.astro) take sideways swipes / ← → keys (game-rows.ts) at
 * once, instead of only once snap.ts has made it active when the glide has settled. Nothing
 * else about it changes until then (its games, buttons, selected look). Cleared by snap.ts
 * when the column settles, and by the next glide.
 */
export function markArriving(scroller: HTMLElement, top: number) {
  const all = containers(scroller);
  all.forEach((cf) => cf.removeAttribute('data-arriving'));
  const i = snapSpans(scroller).findIndex((s) => Math.abs(s.start - top) <= 2);
  if (i >= 0 && !all[i].classList.contains('is-active')) all[i].setAttribute('data-arriving', '');
}
export const clearArriving = (scroller: HTMLElement) =>
  scroller.querySelectorAll('[data-arriving]').forEach((cf) => cf.removeAttribute('data-arriving'));

/** Fired on document by snap.ts when the active container changes; detail = its index. */
export const ACTIVE_CHANGE = 'raydentec:active-change';
export type ActiveChangeEvent = CustomEvent<{ index: number }>;

/** Index of the active (snapped) container in the current column, or -1. */
export function activeIndex() {
  const scroller = getScroller();
  return scroller ? containers(scroller).findIndex((cf) => cf.classList.contains('is-active')) : -1;
}

// html[data-glide-script]: not Chromium — CSS gives the sideways tracks room to spare at their
// far end there (no rubber-band, see stopEdgeBounce).
setRootState('glideScript', SCRIPT_GLIDES ? '' : null);
