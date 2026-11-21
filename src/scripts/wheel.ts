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
 * (further notches, trackpad momentum) is swallowed until the next gesture (dom.ts
 * wheelGesture: after a pause, or a fresh swipe during the last one's momentum); a new
 * gesture during a glide carries on from where that glide is heading.
 * A click, key or touch stops the glide and snapping takes over again.
 *
 * A container a little taller than the visible area (by up to half of it; short windows,
 * phones) has two stops on the way down: its top and its bottom edge; on the way up just its
 * top (any taller container is entered at its top going up, too, then scrolled down). One taller by less than
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
 * snap.ts keeps snapping off while the column rests partway in. An arrow switches section
 * once per press, as soon as it goes down, however long it's held (as ← / → in the rows);
 * held inside a tall one, it scrolls on within it, up to its edge (it doesn't switch on).
 * The deltas would fight `scroll-snap-type: y mandatory` (every small trackpad delta would
 * snap a whole container), so snapping is paused (#scroller[data-wheel]) and the column
 * moves freely. When that gesture stops it settles on a container like a native wheel
 * scroll: the nearest one, or the next one in the scroll direction once it has moved a
 * little (gliding there). Containers taller than the visible area can rest anywhere inside.
 * (A page without containers scrolls natively.)
 *
 * Left alone: over the sidebar when its own content is taller than the viewport (it
 * scrolls itself), the open mobile page menu and pinch-zoom (ctrl). Sideways gestures
 * (dom.ts wheelAxis: by a gesture's first event, kept for all of it) never move the column
 * — the sideways rows and the hero slider take them — and a vertical gesture's sideways
 * drift doesn't scroll anything sideways.
 */
import {
  getRootState,
  getScroller,
  glideScroll,
  isGliding,
  markArriving,
  mq,
  snapOffset,
  snapSpans,
  stopGlide,
  visibleBottom,
  SWIPE_FAST_SPEED,
  swipeShare,
  touchVelocity,
  wheelAxis,
  wheelGesture,
} from './dom';
import { scrollToTop } from './snap';

const SETTLE_MS = 140;
/** A phone (narrow, touch): vertical touch is handled by script (see "Touch on phones"). */
const TOUCH_COLUMN = mq.touchColumn;
/** Moving at least this far commits to the next container in that direction. */
const COMMIT_PX = 30;
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
/** The wheel gesture (dom.ts wheelGesture) `gesture` belongs to. */
let gestureOf = -1;
/** Where the running wheel glide is heading. */
let glideTo = 0;

function normalizedDelta(e: WheelEvent, scroller: HTMLElement) {
  if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) return e.deltaY * 16;
  if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) return e.deltaY * scroller.clientHeight;
  return e.deltaY;
}

/** `exact`: its overflow is meant to be scrolled however small (the mobile info area, see
    withProfile) — no TALL_IGNORE_PX allowance. */
type Span = { start: number; end: number; exact?: boolean };
/** A span with room to scroll (to its end stop): past TALL_IGNORE_PX, or any for an exact one. */
const hasRoom = (s: Span) => s.end - s.start > (s.exact ? 2 : TALL_IGNORE_PX);

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
  // Going down, a container a little taller than the screen also stops at its bottom edge;
  // going up, at its top only (the visitor scrolls on down through it from there).
  const points = spans.flatMap((s) => (dir > 0 && hasRoom(s) ? [s.start, s.end] : [s.start]));
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
  // Exact: however little it overflows, that's its last button not yet clear of the controls
  // (its bottom space, .mprofile__spacer, is what brings it clear) — scrollable.
  return [{ start: 0, end, exact: true }, ...spans];
}

/**
 * Glide the column to a stop: to a container's top as usual; anywhere else (the mobile
 * profile, partway into a tall container) via snap.ts scrollToTop, which keeps snapping off
 * for the trip (see top).
 */
function glideColumn(scroller: HTMLElement, to: number, v0 = 0) {
  glideTo = to;
  markArriving(scroller, to);
  // v0: a touch swipe's speed, carried on (dom.ts releaseEase; touch below).
  if (snapSpans(scroller).some((s) => Math.abs(s.start - to) <= 2)) {
    glideScroll(scroller, { top: to }, undefined, undefined, false, v0);
  } else scrollToTop(scroller, to, v0);
}

/** Something between `el` and the column scrolls sideways by itself (a wide Legal table). */
function scrollsSideways(el: Element, scroller: HTMLElement) {
  for (let n: Element | null = el; n && n !== scroller; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(n).overflowX)) return true;
  }
  return false;
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
    if (e.ctrlKey || getRootState('mmenu') === 'open') return;
    const sidebar = target.closest<HTMLElement>('#sidebar');
    if (sidebar && sidebar.scrollHeight > sidebar.clientHeight + 1) return; // sidebar scrolls itself

    // A sideways gesture (dom.ts wheelAxis) never moves the column, even where it drifts
    // vertically — rows / the hero take it, or nothing does (a wide Legal table scrolls itself).
    if (wheelAxis() === 'x') {
      if (!scrollsSideways(target, scroller)) e.preventDefault();
      return;
    }
    const dy = normalizedDelta(e, scroller);
    if (!dy) {
      // A vertical gesture drifting sideways: no sideways scrolling either (but natively scrolled
      // pages keep theirs).
      if (gesture !== 'native') e.preventDefault();
      return;
    }

    // A new gesture: glide one container, or scroll freely (see top).
    if (wheelGesture() !== gestureOf) {
      gestureOf = wheelGesture();
      const from = isGliding(scroller) ? glideTo : scroller.scrollTop;
      const to = stepTarget(scroller, from, Math.sign(dy));
      gesture = to === null || typeof to === 'number' ? 'step' : to === 'free' ? 'native' : 'free';
      if (typeof to === 'number') glideColumn(scroller, to);
    }

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
  // A held arrow never switches section again: its repeats only scroll on inside a tall one
  // — unless this press has just switched section (then nothing more until it's let go).
  if (e.repeat && arrow) {
    e.preventDefault();
    if (switchedBy === e.key) return;
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
  // On to another section: at once; holding the key doesn't switch again (above).
  if (typeof to === 'number' && arrow && sectionAt(scroller, to) !== sectionAt(scroller, from)) switchedBy = e.key;
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

/** The arrow key whose press (still held) has switched section: its repeats do nothing. */
let switchedBy: string | null = null;

/** Index of the section (container / mobile profile span) a scroll position rests in, or -1. */
function sectionAt(scroller: HTMLElement, pos: number) {
  return withProfile(scroller, snapSpans(scroller)).findIndex((s) => pos >= s.start - 2 && pos <= s.end + 2);
}

document.addEventListener('keyup', (e) => {
  if (e.key === switchedBy) switchedBy = null;
});
window.addEventListener('blur', () => (switchedBy = null));

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
document.addEventListener(
  'touchstart',
  () => {
    // Phones: the vertical touch handling below stops it itself, once a drag turns out to be
    // vertical (a tap / sideways swipe lets it run on) — and must see it still running, to
    // count on from its target (quick swipes add up).
    if (!TOUCH_COLUMN.matches) stopColumnGlide();
  },
  { capture: true, passive: true },
);
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

/*
 * ---------- Touch on phones: vertical swipes as the sideways ones ----------
 * On a phone (narrow, touch: TOUCH_COLUMN) the column doesn't scroll vertically by itself
 * on touch (touch-action pan-x, Shell.astro) — the browsers' own flinging and snapping ran
 * past sections and settled unevenly on real phones. On iPhone, where WebKit scrolled it
 * regardless, it isn't scrollable by the user at all and has no snapping
 * (html[data-ios-touch], as the sideways tracks: ios-swipe.ts) — this sets its position. Sideways swipes stay as they are (the
 * rows: native, or ios-swipe.ts on iOS); wheel, keys and clicks aren't touch.
 *   - A mostly vertical drag (decided by its first DECIDE_PX) moves the column with the
 *     finger, 1:1: freely within the section it counts from (the hero, a tall container,
 *     the mobile info area), and on at most to the start of the next / previous one — one
 *     gesture never crosses more than one section.
 *   - Let go within that section (one taller than the screen): it coasts on at the finger's
 *     speed, within the section (COAST_MS of it).
 *   - Let go past its end / start: on to the next / previous section's start when it went
 *     far enough for its speed — a fast swipe (dom.ts SWIPE_FAST_SPEED) 7.5 %, a slow one
 *     25 % of the way: half the sideways shares (dom.ts swipeShare × VERTICAL_SHARE) — else
 *     back; gliding from the finger's speed (dom.ts releaseEase).
 *   - Begun while a switch was still gliding: it counts from that switch's target, and a
 *     drag of CHAIN_PX that way goes one further (quick swipes add up).
 */
const DECIDE_PX = 6;
const CHAIN_PX = 10;
const COAST_MS = 300;
/** Vertical swipes switch sooner than sideways ones: this share of theirs (half: 7.5 % fast, 25 % slow). */
const VERTICAL_SHARE = 0.5;
let vdrag: {
  scroller: HTMLElement;
  id: number;
  x0: number;
  y0: number;
  top0: number;
  anchor: number;
  chained: boolean;
  lo: number;
  hi: number;
  axis: 'x' | 'y' | null;
} | null = null;

/** Index of the section (mobile info area / container span) a scroll position counts in. */
const sectionFrom = (spans: Span[], pos: number) => {
  let i = 0;
  spans.forEach((s, k) => {
    if (s.start <= pos + 2) i = k;
  });
  return i;
};

document.addEventListener(
  'touchstart',
  (e) => {
    const scroller = getScroller();
    if (vdrag || !scroller || !TOUCH_COLUMN.matches || e.touches.length !== 1) return;
    const target = e.target as Element | null;
    if (!target || !scroller.contains(target) || getRootState('mmenu') === 'open') return;
    const chained = isGliding(scroller);
    const top0 = scroller.scrollTop;
    const anchor = chained ? glideTo : top0;
    const spans = withProfile(scroller, snapSpans(scroller));
    if (!spans.length) return;
    const i = sectionFrom(spans, anchor);
    const max = scroller.scrollHeight - scroller.clientHeight;
    const lo = i > 0 ? spans[i - 1].start : 0;
    const hi = i < spans.length - 1 ? spans[i + 1].start : max;
    const f = e.touches[0];
    vdrag = {
      scroller,
      id: f.identifier,
      x0: f.clientX,
      y0: f.clientY,
      top0,
      anchor,
      chained,
      // Always taking in where it is (mid-glide it can lie outside): no jump on the first move.
      lo: Math.min(lo, top0),
      hi: Math.min(max, Math.max(hi, top0)),
      axis: null,
    };
  },
  { capture: true, passive: true },
);

document.addEventListener(
  'touchmove',
  (e) => {
    if (!vdrag) return;
    const d = vdrag;
    const f = Array.from(e.touches).find((t) => t.identifier === d.id);
    if (!f) return;
    const dx = f.clientX - d.x0;
    const dy = f.clientY - d.y0;
    if (!d.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < DECIDE_PX) return;
      d.axis = Math.abs(dy) >= Math.abs(dx) ? 'y' : 'x';
      if (d.axis === 'y') {
        stopGlide(d.scroller);
        d.scroller.dataset.wheel = ''; // snapping paused while it follows the finger
      }
    }
    if (d.axis !== 'y') return; // a sideways swipe: the row's
    // Instant: the column has scroll-behavior smooth, which made it trail the finger.
    d.scroller.scrollTo({ top: Math.max(d.lo, Math.min(d.hi, d.top0 - dy)), behavior: 'instant' });
  },
  { capture: true, passive: true },
);

const touchEnd = (e: TouchEvent) => {
  const d = vdrag;
  if (!d || Array.from(e.touches).some((t) => t.identifier === d.id)) return;
  vdrag = null;
  if (d.axis !== 'y') return; // a tap / a sideways swipe: nothing changed here
  const { scroller } = d;
  // Snapping comes back on only after the glide has started (it's still paused: reading the
  // position with it on snapped the column straight back to the nearest section).
  try {
    releaseColumn(d);
  } finally {
    delete scroller.dataset.wheel;
  }
};
function releaseColumn(d: NonNullable<typeof vdrag>) {
  const { scroller } = d;
  const pos = scroller.scrollTop;
  const v = touchVelocity('y');
  const spans = withProfile(scroller, snapSpans(scroller));
  if (!spans.length) return;
  // Begun mid-switch: on from that switch's target, one further if dragged that way — when
  // that is a switch (swiped against it: from where it is, see below). Where that way leads into a tall section's free scrolling instead (up
  // from its bottom edge, down from its top), it's a fresh drag from where the column is:
  // carrying on to the old target bounced it back.
  if (d.chained) {
    const dir = Math.abs(pos - d.top0) >= CHAIN_PX ? Math.sign(pos - d.top0) : 0;
    // Against the glide it interrupted (it was heading the other way): turned round — on to
    // the next stop that way from where the column is, not from the old target.
    const against = dir !== 0 && Math.sign(d.anchor - d.top0) === -dir;
    const to = dir ? stepTarget(scroller, against ? d.top0 : d.anchor, dir) : d.anchor;
    if (typeof to === 'number' || !dir) {
      glideColumn(scroller, typeof to === 'number' ? to : d.anchor, v);
      return;
    }
    if (to === null) {
      glideColumn(scroller, d.anchor, v); // at the end of the column
      return;
    }
    // Free scrolling that way: as an unchained drag (below), in the anchor's section.
  }
  const i = sectionFrom(spans, d.anchor);
  const span = spans[i];
  // A section barely taller than the screen (TALL_IGNORE_PX) counts as fitting: just its top
  // (not the info area: its little overflow brings its last button clear of the controls).
  const sec = hasRoom(span) ? span : { start: span.start, end: span.start };
  // Within its section: coast on at the finger's speed, staying inside it.
  if (pos >= sec.start - 1 && pos <= sec.end + 1) {
    if (sec.end - sec.start <= 2) {
      if (Math.abs(pos - sec.start) > 1) glideColumn(scroller, sec.start);
      return;
    }
    const to = Math.max(sec.start, Math.min(sec.end, pos + v * COAST_MS));
    if (Math.abs(to - pos) > 1) glideColumn(scroller, to, v);
    return;
  }
  // Past its end / start: on to the next / previous section if far enough for its speed.
  const down = pos > sec.end;
  const from = down ? sec.end : sec.start;
  const next = down ? spans[i + 1]?.start : i > 0 ? spans[i - 1].start : 0;
  if (next === undefined) {
    glideColumn(scroller, from, v);
    return;
  }
  const fast = Math.abs(v) >= SWIPE_FAST_SPEED && Math.sign(v) === (down ? 1 : -1);
  const far = Math.abs(pos - from) >= Math.abs(next - from) * swipeShare(fast) * VERTICAL_SHARE;
  glideColumn(scroller, far ? next : from, v);
}
document.addEventListener('touchend', touchEnd, { capture: true, passive: true });
document.addEventListener('touchcancel', touchEnd, { capture: true, passive: true });
