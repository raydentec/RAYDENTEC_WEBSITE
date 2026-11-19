/**
 * Vertical mouse wheel / trackpad scrolling of the content column, from anywhere in the
 * viewport (not only over the column: nav, rail, footer, background, gutters…) — and the
 * scrolling keys: ↑ / ↓, Page Up / Down and Space (Shift+Space up) move one container the
 * same way (below), as do the wheel's. Left to the browser, keyboard scrolling was abrupt in
 * Safari / Firefox and could be pulled back to the selected container while a row glided
 * sideways. Not while typing, on a focused button / link (Space presses it), in the
 * sidebar or the open mobile menu, or with Ctrl / Alt / Cmd. Home / End stay the browser's.
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
 * Mobile: the profile / info area above the containers counts as one more container, from
 * the very top of the page: one stop where it fits the screen (regular phones), and on
 * short phones the same stops / free scrolling inside as a taller container, down to
 * where its end (the space kept clear of the bottom controls) reaches the column's bottom.
 * Glides into it go via snap.ts scrollToTop, which keeps snapping off for the trip (the
 * browser would pull it back onto container 1).
 *
 * Free scrolling instead (decided per gesture): inside a much taller container (a Legal
 * document, a row on a short phone) while there's more of it in the gesture's direction —
 * by script, not the browser (with snapping on, Safari / Firefox pulled the column back
 * to the container's top): wheel deltas move the column with snapping paused, and the
 * keys glide by a quarter screen (arrows) or most of one (Page Up / Down, Space), up to
 * the container's ends — an arrow held down scrolls on continuously instead (below);
 * snap.ts keeps snapping off while the column rests partway in. An arrow only switches
 * section with a tap: pressed towards the next / previous section, it goes once the key is
 * let go before it repeats; held down, it stays in the section (scrolling on within a tall
 * one, else nothing).
 * The deltas would fight `scroll-snap-type: y mandatory` (every small trackpad delta would
 * snap a whole container), so snapping is paused (#scroller[data-wheel]) and the column
 * moves freely. When that gesture stops it settles on a container like a native wheel
 * scroll: the nearest one, or the next one in the scroll direction once it has moved a
 * little (gliding there). Containers taller than the visible area can rest anywhere inside.
 * (A page without containers scrolls natively.)
 *
 * Left alone: over the sidebar when its own content is taller than the viewport (it
 * scrolls itself), the open mobile page menu, pinch-zoom (ctrl) and mostly-horizontal
 * gestures (sideways rows, the hero slider).
 */
import {
  getRootState,
  getScroller,
  glideScroll,
  isGliding,
  mq,
  snapOffset,
  snapSpans,
  stopGlide,
  visibleBottom,
} from './dom';
import { scrollToTop } from './snap';

const SETTLE_MS = 140;
/** Moving at least this far commits to the next container in that direction. */
const COMMIT_PX = 30;
/** A wheel gesture (incl. trackpad momentum) has ended when no event came for this long. */
const INPUT_REST_MS = 200;
/** A container this much taller than the visible area or less counts as fitting (one stop). */
const TALL_IGNORE_PX = 32;

let settleTimer = 0;
let gestureStart: number | null = null;

/**
 * Current gesture: 'step' (one glide), 'free' (scrolls freely by script, deltas applied to
 * the column with snapping paused), 'native' (the browser's own: no containers), or null
 * between gestures.
 */
let gesture: 'step' | 'free' | 'native' | null = null;
let gestureTimer = 0;
/** Where the running wheel glide is heading. */
let glideTo = 0;

function normalizedDelta(e: WheelEvent, scroller: HTMLElement) {
  if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) return e.deltaY * 16;
  if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) return e.deltaY * scroller.clientHeight;
  return e.deltaY;
}

type Span = { start: number; end: number };

/** Height of the area containers show in, from the snap line (dom.ts visibleBottom). */
const visibleHeight = (scroller: HTMLElement) =>
  visibleBottom(scroller) - scroller.getBoundingClientRect().top - snapOffset(scroller);

/**
 * Where a wheel gesture / key in direction `dir` from `pos` glides to: the next snap
 * position that way; inside a tall container with more of it that way, that container's
 * span (scrolled freely within, see top); 'free' with no containers; null at either end.
 */
function stepTarget(scroller: HTMLElement, pos: number, dir: number): number | Span | 'free' | null {
  const spans = withProfile(scroller, snapSpans(scroller));
  if (!spans.length) return 'free';
  const free = visibleHeight(scroller) / 2;
  const tall = spans.find(
    (s) => s.end - s.start > free && (dir > 0 ? pos >= s.start - 2 && pos < s.end - 2 : pos <= s.end + 2 && pos > s.start + 2),
  );
  if (tall) return tall;
  const points = spans.flatMap((s) => (s.end - s.start > TALL_IGNORE_PX ? [s.start, s.end] : [s.start]));
  const ahead = points.filter((p) => (dir > 0 ? p > pos + 2 : p < pos - 2));
  if (!ahead.length) return null;
  return dir > 0 ? Math.min(...ahead) : Math.max(...ahead);
}

/**
 * Mobile: the profile / info area above the containers ([data-mprofile], Shell.astro) as a
 * span before theirs — from the top of the page to where its bottom edge reaches the
 * column's bottom (0 where it fits).
 */
function withProfile(scroller: HTMLElement, spans: { start: number; end: number }[]) {
  const profile = scroller.querySelector<HTMLElement>('[data-mprofile]');
  if (!mq.mobile.matches || !profile || !spans.length || spans[0].start <= 2 || !profile.getClientRects().length) {
    return spans;
  }
  const bottom = scroller.scrollTop + profile.getBoundingClientRect().bottom - scroller.getBoundingClientRect().top;
  const end = Math.min(spans[0].start, Math.max(0, bottom - scroller.clientHeight));
  return [{ start: 0, end }, ...spans];
}

/**
 * Glide the column to a stop: to a container's top as usual; anywhere else (the mobile
 * profile, partway into a tall container) via snap.ts scrollToTop, which keeps snapping off
 * for the trip (see top).
 */
function glideColumn(scroller: HTMLElement, to: number) {
  glideTo = to;
  if (snapSpans(scroller).some((s) => Math.abs(s.start - to) <= 2)) glideScroll(scroller, { top: to });
  else scrollToTop(scroller, to);
}

/** Forwarded free scrolling has stopped: settle on a container (see top). */
function settle(scroller: HTMLElement) {
  const from = gestureStart ?? scroller.scrollTop;
  gestureStart = null;
  const release = () => delete scroller.dataset.wheel;

  // Free-scrolling areas: the mobile profile above the containers.
  if (scroller.dataset.snap === 'off') return release();

  const pos = scroller.scrollTop;
  const spans = snapSpans(scroller);
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
  // Resume snapping only once the glide has reached the target (it would snap back).
  glideTo = target;
  glideScroll(scroller, { top: target }, release);
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
      const to = stepTarget(scroller, from, Math.sign(dy));
      gesture = to === null || typeof to === 'number' ? 'step' : to === 'free' ? 'native' : 'free';
      if (typeof to === 'number') glideColumn(scroller, to);
    }
    window.clearTimeout(gestureTimer);
    gestureTimer = window.setTimeout(() => (gesture = null), INPUT_REST_MS);

    if (gesture === 'step') {
      e.preventDefault(); // the rest of the gesture is swallowed
      return;
    }

    if (gesture === 'native' && scroller.contains(target)) return;
    // Free: the deltas move the column, snapping paused (natively, Safari / Firefox pulled a
    // tall container back to its top; from outside the column there's no native scrolling).
    e.preventDefault();
    if (gestureStart === null) gestureStart = scroller.scrollTop;
    scroller.dataset.wheel = '';
    scroller.scrollTop += dy;
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => settle(scroller), SETTLE_MS);
  },
  { passive: false },
);

// ---------- Keys: one container per press, as a wheel gesture (see top) ----------
const KEY_DIR: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: 1, PageUp: -1, ' ': 1 };

document.addEventListener('keydown', (e) => {
  const scroller = getScroller();
  let dir = KEY_DIR[e.key];
  if (!scroller || !dir || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === ' ') dir = e.shiftKey ? -1 : 1;
  else if (e.shiftKey) return;
  if (getRootState('mmenu') === 'open') return;
  const target = e.target as Element | null;
  if (target?.closest('input, textarea, select, [contenteditable], #sidebar, [data-filter-panel]')) return;
  if (e.key === ' ' && target?.closest('a, button, summary, [role="button"]')) return;
  // Held arrow key inside a tall container: one continuous scroll (see below), not a glide
  // restarted by every key repeat (that stuttered).
  if (hold) {
    if (e.key === hold.key) {
      e.preventDefault();
      return;
    }
    endHold(scroller);
  }
  const arrow = e.key.startsWith('Arrow');
  // A held arrow never switches section (see below): its repeats only scroll on inside a
  // tall one, else do nothing.
  if (e.repeat && arrow) {
    e.preventDefault();
    tap = null;
    const span = stepTarget(scroller, scroller.scrollTop, dir);
    if (span !== null && typeof span === 'object') startHold(scroller, e.key, dir, span);
    return;
  }
  // From where a running glide is heading, so quick presses add up.
  const from = isGliding(scroller) ? glideTo : scroller.scrollTop;
  const to = stepTarget(scroller, from, dir);
  if (to === 'free') {
    stopGlide(scroller); // the browser's own keyboard scrolling
    return;
  }
  e.preventDefault();
  if (to === null) return; // at the end
  // An arrow on to another section: only once the key is let go without repeating (a tap,
  // keyup below) — holding it doesn't switch.
  if (typeof to === 'number' && arrow && sectionAt(scroller, to) !== sectionAt(scroller, from)) {
    tap = { key: e.key, dir };
    return;
  }
  if (typeof to === 'number') glideColumn(scroller, to);
  // Inside a tall container: on by a quarter screen (arrows) or most of one (Page / Space),
  // not past its ends — the next press there goes on to the next stop.
  else {
    const by = (e.key.startsWith('Arrow') ? 0.25 : 0.85) * visibleHeight(scroller);
    glideColumn(scroller, Math.min(to.end, Math.max(to.start, from + dir * by)));
  }
});

/*
 * Arrow key held down inside a tall container: once the key repeats, the column scrolls on
 * continuously — easing up to HOLD_SPEED, at most to the container's end — until the key is
 * let go, then eases to a stop (HOLD_RAMP_MS). Snapping is paused meanwhile
 * (#scroller[data-wheel], as for wheel input). A short press stays a single glide (above).
 */
const HOLD_SPEED = 700; // px/s
const HOLD_RAMP_MS = 180;
let hold: { key: string; dir: number; span: Span; v: number; last: number; frame: number; releasing: boolean } | null =
  null;

function startHold(scroller: HTMLElement, key: string, dir: number, span: Span) {
  // Carry on from the first press's glide where it is (keeping its pace would need its speed).
  stopGlide(scroller);
  scroller.dataset.wheel = '';
  const h = { key, dir, span, v: 0, last: performance.now(), frame: 0, releasing: false };
  hold = h;
  const accel = HOLD_SPEED / (HOLD_RAMP_MS / 1000);
  const step = (now: number) => {
    if (hold !== h) return;
    const dt = Math.min(50, now - h.last) / 1000;
    h.last = now;
    h.v = h.releasing ? Math.max(0, h.v - accel * dt) : Math.min(HOLD_SPEED, h.v + accel * dt);
    const pos = Math.min(h.span.end, Math.max(h.span.start, scroller.scrollTop + h.dir * h.v * dt));
    scroller.scrollTo({ top: pos, behavior: 'instant' });
    const atEdge = pos <= h.span.start || pos >= h.span.end;
    if (h.releasing && (h.v === 0 || atEdge)) {
      endHold(scroller);
      return;
    }
    h.frame = requestAnimationFrame(step);
  };
  h.frame = requestAnimationFrame(step);
}

/** Stop the held-key scroll at once; snapping takes over (snap.ts keeps it off partway in). */
function endHold(scroller: HTMLElement) {
  if (!hold) return;
  cancelAnimationFrame(hold.frame);
  hold = null;
  glideTo = scroller.scrollTop;
  delete scroller.dataset.wheel;
}

/** Arrow pressed towards another section, waiting to see if it's a tap (keyup) or a hold. */
let tap: { key: string; dir: number } | null = null;

/** Index of the section (container / mobile profile span) a scroll position rests in, or -1. */
function sectionAt(scroller: HTMLElement, pos: number) {
  return withProfile(scroller, snapSpans(scroller)).findIndex((s) => pos >= s.start - 2 && pos <= s.end + 2);
}

// A tap: switch section now (from where a running glide is heading).
document.addEventListener('keyup', (e) => {
  const scroller = getScroller();
  if (!tap || e.key !== tap.key || !scroller) return;
  const { dir } = tap;
  tap = null;
  const to = stepTarget(scroller, isGliding(scroller) ? glideTo : scroller.scrollTop, dir);
  if (typeof to === 'number') glideColumn(scroller, to);
});
window.addEventListener('blur', () => (tap = null));

/** The held key is let go (or the window loses focus): ease to a stop. */
const releaseHold = (e?: KeyboardEvent) => {
  if (hold && (!e || e.key === hold.key)) hold.releasing = true;
};
document.addEventListener('keyup', releaseHold);
window.addEventListener('blur', () => releaseHold());

// The user takes over (touch, Home / End): stop a glide, snapping takes over. (Clicks and
// the keys above don't: they take it over, snap.ts / scroll-control.ts.)
const stopColumnGlide = () => {
  const scroller = getScroller();
  if (!scroller) return;
  stopGlide(scroller);
  endHold(scroller);
};
document.addEventListener('touchstart', stopColumnGlide, { capture: true, passive: true });
document.addEventListener(
  'keydown',
  (e) => {
    if (e.key === 'Home' || e.key === 'End') stopColumnGlide();
  },
  { capture: true },
);
document.addEventListener('astro:before-swap', () => {
  stopColumnGlide();
  gesture = null;
});
