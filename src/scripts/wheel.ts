/**
 * Mouse wheel / trackpad scrolling anywhere in the viewport scrolls the content column,
 * not only when the pointer is over it (nav, rail, footer, background, gutters…).
 *
 * Exception: over the sidebar when its own content is taller than the viewport — it
 * scrolls itself then. Also left alone: the open mobile page menu, pinch-zoom (ctrl)
 * and mostly-horizontal gestures.
 *
 * Forwarded deltas would fight `scroll-snap-type: y mandatory` (every small trackpad
 * delta would snap a whole container), so while forwarding, snapping is paused
 * (#scroller[data-wheel]) and the column moves freely. When the gesture stops it settles
 * on a container like a native wheel scroll: the nearest one, or the next one in the
 * scroll direction once it has moved a little. Containers taller than the visible area
 * (short phones) can rest anywhere inside, as with native scrolling.
 */
import { containers, getRootState, getScroller, scrollBehavior, snapOffset } from './dom';

const SETTLE_MS = 140;
/** Moving at least this far commits to the next container in that direction. */
const COMMIT_PX = 30;

let settleTimer = 0;
let gestureStart: number | null = null;

function normalizedDelta(e: WheelEvent, scroller: HTMLElement) {
  if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) return e.deltaY * 16;
  if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) return e.deltaY * scroller.clientHeight;
  return e.deltaY;
}

/** Scroll positions at which each container's top sits on the snap line. */
function snapPositions(scroller: HTMLElement) {
  const line = scroller.getBoundingClientRect().top + snapOffset(scroller);
  const max = scroller.scrollHeight - scroller.clientHeight;
  return containers(scroller).map((cf) => {
    const r = cf.getBoundingClientRect();
    const start = Math.min(max, Math.max(0, scroller.scrollTop + (r.top - line)));
    // A container taller than the visible area can rest anywhere between its start and end.
    const end = Math.min(max, start + Math.max(0, r.height - (scroller.clientHeight - snapOffset(scroller))));
    return { start, end };
  });
}

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
    if (!scroller || !target || scroller.contains(target)) return; // native scrolling
    if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    if (getRootState('mmenu') === 'open') return;
    const sidebar = target.closest<HTMLElement>('#sidebar');
    if (sidebar && sidebar.scrollHeight > sidebar.clientHeight + 1) return; // sidebar scrolls itself

    const dy = normalizedDelta(e, scroller);
    if (!dy) return;
    e.preventDefault();
    if (gestureStart === null) gestureStart = scroller.scrollTop;
    scroller.dataset.wheel = '';
    scroller.scrollTop += dy;
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => settle(scroller), SETTLE_MS);
  },
  { passive: false },
);
