/**
 * Vertical mouse wheel / trackpad scrolling of the content column, from anywhere in the
 * viewport (not only over the column: nav, rail, footer, background, gutters…).
 *
 * Between containers, each wheel gesture glides to the next / previous one (dom.ts
 * glideScroll), as when a container is clicked or SCROLL is used. Left to the browser,
 * wheel snapping differs a lot: Chrome switched in a quick jerk, and in Safari every
 * further wheel event cut into the running glide (stutter). The rest of the gesture
 * (further notches, trackpad momentum) is swallowed until the input has stopped for
 * INPUT_REST_MS; a new gesture during a glide carries on from where that glide is heading.
 * A click, key or touch stops the glide and snapping takes over again.
 *
 * A container a little taller than the visible area (by up to half of it; short windows,
 * phones) has two stops: its top and its bottom edge. One taller by less than
 * TALL_IGNORE_PX (a Games row's bottom margin) counts as fitting: just its top.
 *
 * Free scrolling instead (decided per gesture):
 *   - inside a much taller container (a Legal document) while there's more of it in the
 *     gesture's direction;
 *   - the mobile profile above the containers (snapping off, snap.ts).
 * Over the column that's the browser's own scrolling. From outside it, the deltas are
 * forwarded; they would fight `scroll-snap-type: y mandatory` (every small trackpad delta
 * would snap a whole container), so snapping is paused (#scroller[data-wheel]) and the
 * column moves freely. When that gesture stops it settles on a container like a native
 * wheel scroll: the nearest one, or the next one in the scroll direction once it has moved
 * a little. Containers taller than the visible area can rest anywhere inside.
 *
 * Left alone: over the sidebar when its own content is taller than the viewport (it
 * scrolls itself), the open mobile page menu, pinch-zoom (ctrl) and mostly-horizontal
 * gestures (sideways rows, the hero slider).
 */
import {
  containers,
  getRootState,
  getScroller,
  glideScroll,
  isGliding,
  scrollBehavior,
  snapOffset,
  snapTop,
  stopGlide,
} from './dom';

const SETTLE_MS = 140;
/** Moving at least this far commits to the next container in that direction. */
const COMMIT_PX = 30;
/** A wheel gesture (incl. trackpad momentum) has ended when no event came for this long. */
const INPUT_REST_MS = 200;
/** A container this much taller than the visible area or less counts as fitting (one stop). */
const TALL_IGNORE_PX = 24;

let settleTimer = 0;
let gestureStart: number | null = null;

/** Current gesture: 'step' (one glide), 'free' (scrolls freely), or null between gestures. */
let gesture: 'step' | 'free' | null = null;
let gestureTimer = 0;
/** Where the running wheel glide is heading. */
let glideTo = 0;

function normalizedDelta(e: WheelEvent, scroller: HTMLElement) {
  if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) return e.deltaY * 16;
  if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) return e.deltaY * scroller.clientHeight;
  return e.deltaY;
}

/** Scroll positions at which each container's snap edge (dom.ts snapTop) sits on the snap line. */
function snapPositions(scroller: HTMLElement) {
  const line = scroller.getBoundingClientRect().top + snapOffset(scroller);
  const max = scroller.scrollHeight - scroller.clientHeight;
  return containers(scroller).map((cf) => {
    const top = snapTop(cf);
    const height = cf.getBoundingClientRect().bottom - top;
    const start = Math.min(max, Math.max(0, scroller.scrollTop + (top - line)));
    // A container taller than the visible area can rest anywhere between its start and end.
    const end = Math.min(max, start + Math.max(0, height - (scroller.clientHeight - snapOffset(scroller))));
    return { start, end };
  });
}

/**
 * Where a wheel gesture in direction `dir` from `pos` glides to: the next snap position
 * that way; 'free' inside a tall container with more of it that way (or no containers);
 * null at either end of the column.
 */
function stepTarget(scroller: HTMLElement, pos: number, dir: number): number | 'free' | null {
  const spans = snapPositions(scroller);
  if (!spans.length) return 'free';
  const free = (scroller.clientHeight - snapOffset(scroller)) / 2;
  const inTall = spans.some(
    (s) => s.end - s.start > free && (dir > 0 ? pos >= s.start - 2 && pos < s.end - 2 : pos <= s.end + 2 && pos > s.start + 2),
  );
  if (inTall) return 'free';
  const points = spans.flatMap((s) => (s.end - s.start > TALL_IGNORE_PX ? [s.start, s.end] : [s.start]));
  const ahead = points.filter((p) => (dir > 0 ? p > pos + 2 : p < pos - 2));
  if (!ahead.length) return null;
  return dir > 0 ? Math.min(...ahead) : Math.max(...ahead);
}

/** Forwarded free scrolling has stopped: settle on a container (see top). */
function settle(scroller: HTMLElement) {
  const from = gestureStart ?? scroller.scrollTop;
  gestureStart = null;
  const release = () => delete scroller.dataset.wheel;

  // Free-scrolling areas: the mobile profile above the containers.
  if (scroller.dataset.snap === 'off') return release();

  const pos = scroller.scrollTop;
  const spans = snapPositions(scroller);
  if (!spans.length) return release();
  // Resting inside a tall container is allowed, as with native scrolling.
  if (spans.some((s) => s.end > s.start && pos >= s.start && pos <= s.end)) return release();

  const points = spans.flatMap((s) => (s.end > s.start ? [s.start, s.end] : [s.start]));
  let target = points.reduce((a, b) => (Math.abs(b - pos) < Math.abs(a - pos) ? b : a));
  const moved = pos - from;
  // Within 2px of the start counts as the start (positions can be sub-pixel).
  const notAhead = Math.abs(target - from) < 2 || Math.sign(target - from) !== Math.sign(moved);
  if (Math.abs(moved) >= COMMIT_PX && notAhead) {
    // Nearest point is back where the gesture started: go to the next one in its direction.
    const ahead = points.filter((p) => (moved > 0 ? p > from + 2 : p < from - 2));
    if (ahead.length) target = moved > 0 ? Math.min(...ahead) : Math.max(...ahead);
  }

  if (Math.abs(target - pos) < 1) return release();
  // Resume snapping only once the glide has reached the target — a late `scrollend`
  // from the forwarded scroll must not switch it back on mid-glide (it would snap back).
  const done = () => {
    if (Math.abs(scroller.scrollTop - target) > 2) return;
    scroller.removeEventListener('scrollend', done);
    window.clearTimeout(fallback);
    release();
  };
  const fallback = window.setTimeout(() => {
    scroller.removeEventListener('scrollend', done);
    release();
  }, 1200); // in case scrollend never fires
  scroller.addEventListener('scrollend', done);
  scroller.scrollTo({ top: target, behavior: scrollBehavior() });
}

document.addEventListener(
  'wheel',
  (e) => {
    const scroller = getScroller();
    const target = e.target as Element | null;
    if (!scroller || !target || e.defaultPrevented) return; // taken by a sideways row / the hero
    if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    if (getRootState('mmenu') === 'open') return;
    const sidebar = target.closest<HTMLElement>('#sidebar');
    if (sidebar && sidebar.scrollHeight > sidebar.clientHeight + 1) return; // sidebar scrolls itself

    const dy = normalizedDelta(e, scroller);
    if (!dy) return;

    // A new gesture: glide one container, or scroll freely (see top).
    if (gesture === null) {
      const from = isGliding(scroller) ? glideTo : scroller.scrollTop;
      const to = scroller.dataset.snap === 'off' ? 'free' : stepTarget(scroller, from, Math.sign(dy));
      gesture = to === 'free' ? 'free' : 'step';
      if (typeof to === 'number') {
        glideTo = to;
        glideScroll(scroller, { top: to });
      }
    }
    window.clearTimeout(gestureTimer);
    gestureTimer = window.setTimeout(() => (gesture = null), INPUT_REST_MS);

    if (gesture === 'step') {
      e.preventDefault(); // the rest of the gesture is swallowed
      return;
    }

    // Free: native over the column; forwarded from outside it.
    if (scroller.contains(target)) return;
    e.preventDefault();
    if (gestureStart === null) gestureStart = scroller.scrollTop;
    scroller.dataset.wheel = '';
    scroller.scrollTop += dy;
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => settle(scroller), SETTLE_MS);
  },
  { passive: false },
);

// The user takes over (key, touch): stop a glide, snapping takes over. (Clicks don't stop
// it: a click on a container or SCROLL takes it over, snap.ts / scroll-control.ts.)
const stopColumnGlide = () => {
  const scroller = getScroller();
  if (scroller) stopGlide(scroller);
};
for (const type of ['keydown', 'touchstart'] as const) {
  document.addEventListener(type, stopColumnGlide, { capture: true, passive: true });
}
document.addEventListener('astro:before-swap', () => {
  stopColumnGlide();
  gesture = null;
});
