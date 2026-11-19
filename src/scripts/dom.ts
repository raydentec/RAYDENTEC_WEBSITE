/**
 * Shared helpers for the shell scripts.
 *
 * Scripts are bundled modules, so their top level runs once per full page load.
 * Listeners on document/window and on `transition:persist` elements are bound
 * there; anything inside the swapped content column (#scroller) is re-read on
 * every `astro:page-load`.
 */

export const mq = {
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
export function glideScroll(el: HTMLElement, to: { left?: number; top?: number }, onDone?: () => void, ms = GLIDE_MS) {
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
  if (NATIVE_SMOOTH) {
    delete el.dataset.gliding;
    el.addEventListener('scrollend', onEnd);
    fallback = window.setTimeout(finish, ms + 1000); // in case no scrollend comes
    el.scrollTo({ left: x1, top: y1, behavior: 'smooth' });
    return;
  }
  el.dataset.gliding = '';
  const start = performance.now();
  const step = (now: number) => {
    const p = Math.min(1, (now - start) / ms);
    const e = CHROME_EASE(p);
    el.scrollTo({ left: x0 + (x1 - x0) * e, top: y0 + (y1 - y0) * e, behavior: 'instant' });
    if (p < 1) frame = requestAnimationFrame(step);
    else finish();
  };
  frame = requestAnimationFrame(step);
}

/** Stop a running glide of `el` where it is; snapping takes over again. */
export function stopGlide(el: HTMLElement) {
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
 * anywhere from there down to where its bottom edge shows (end).
 */
export function snapSpans(scroller: HTMLElement) {
  const line = scroller.getBoundingClientRect().top + snapOffset(scroller);
  const visible = visibleBottom(scroller) - line;
  const max = scroller.scrollHeight - scroller.clientHeight;
  return containers(scroller).map((cf) => {
    const top = snapTop(cf);
    const height = cf.getBoundingClientRect().bottom - top;
    const start = Math.min(max, Math.max(0, scroller.scrollTop + (top - line)));
    const end = Math.min(max, start + Math.max(0, height - visible));
    return { start, end };
  });
}

/** Fired on document by snap.ts when the active container changes; detail = its index. */
export const ACTIVE_CHANGE = 'raydentec:active-change';
export type ActiveChangeEvent = CustomEvent<{ index: number }>;

/** Index of the active (snapped) container in the current column, or -1. */
export function activeIndex() {
  const scroller = getScroller();
  return scroller ? containers(scroller).findIndex((cf) => cf.classList.contains('is-active')) : -1;
}
