/**
 * Games rows (GameRow.astro). Each row's games scroll sideways in its
 * track (CSS x-snapping). The game resting at the row's left edge is the row's current
 * one: its indicator line is lit and — while the row is the active container (snap.ts)
 * — it shows as selected (`.is-active`). Clicking an indicator line or a partly visible
 * game scrolls the row to that game. The ← / → keys step through the selected row's
 * games — no need to click or focus it first. Also drives the Start page's explore row.
 *
 * Every switch — line, game click, key, wheel — glides the same way (dom.ts glideScroll:
 * Chrome's own smooth scroll there, a glide by script elsewhere; Safari's own was a quick
 * jump on click).
 *
 * Touch swipes scroll natively, but stop at the next game (scroll-snap-stop, GameRow.astro);
 * one that still lands further away is brought back to the next game once it rests
 * (touchFrom below). The ← / → keys move one game per press (holding one doesn't run on).
 *
 * Sideways wheel / trackpad / Shift+wheel over a track doesn't scroll it natively: each
 * gesture glides one game on, and the rest of the gesture (further notches, trackpad
 * momentum) is swallowed until the next gesture (dom.ts wheelGesture). Left to the
 * browser, Chrome switched in a quick jerk and Safari's glide stuttered as each further
 * wheel event cut into it (as the column did, wheel.ts). A new gesture during a glide
 * carries on from the game it heads to; touching the track stops it.
 */
import {
  ACTIVE_CHANGE,
  getRootState,
  getScroller,
  glideScroll,
  onPageLoad,
  stopGlide,
  wheelAxis,
  wheelGesture,
} from './dom';

const SETTLE_MS = 90;
/** Sideways wheel travel that switches a game. */
const WHEEL_STEP_PX = 30;
const settleTimers = new WeakMap<HTMLElement, number>();
/** Game a row is gliding to (keys, wheel…), so quick presses add up (cleared once it rests). */
const targets = new WeakMap<HTMLElement, number>();

const rows = () => Array.from(getScroller()?.querySelectorAll<HTMLElement>('[data-row]') ?? []);
const track = (row: HTMLElement) => row.querySelector<HTMLElement>('[data-row-track]');
const games = (row: HTMLElement) => Array.from(row.querySelectorAll<HTMLElement>('[data-row-track] [data-cf]'));
const dots = (row: HTMLElement) => Array.from(row.querySelectorAll<HTMLElement>('[data-row-dot]'));

/** Where games snap in a track: its left edge plus its scroll padding. */
const snapLine = (t: HTMLElement) =>
  t.getBoundingClientRect().left + (parseFloat(getComputedStyle(t).scrollPaddingLeft) || 0);

function currentIndex(row: HTMLElement) {
  const t = track(row);
  if (!t) return 0;
  const line = snapLine(t);
  let best = 0;
  let bestDistance = Infinity;
  games(row).forEach((game, i) => {
    const d = Math.abs(game.getBoundingClientRect().left - line);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  });
  return best;
}

/** Game a touch swipe began at, while the finger is down / the swipe hasn't come to rest. */
const touchFrom = new WeakMap<HTMLElement, number>();
let touchingRow: HTMLElement | null = null;

function sync(row: HTMLElement) {
  targets.delete(row);
  const current = currentIndex(row);
  // A swipe that came to rest more than one game from where it began (a browser that let
  // it fly past scroll-snap-stop): back to the next game in its direction.
  const from = touchFrom.get(row);
  if (from !== undefined && touchingRow !== row) {
    touchFrom.delete(row);
    if (Math.abs(current - from) > 1) {
      show(row, from + Math.sign(current - from));
      return;
    }
  }
  const active = row.classList.contains('is-active');
  games(row).forEach((game, i) => game.classList.toggle('is-active', active && i === current));
  dots(row).forEach((dot, i) => {
    if (i === current) dot.setAttribute('aria-current', 'true');
    else dot.removeAttribute('aria-current');
  });
}

const syncAll = () => rows().forEach(sync);

/** Glide the row's track to a game (as far as the track scrolls), then sync the row. */
function show(row: HTMLElement, index: number) {
  const t = track(row);
  const game = games(row)[index];
  if (!t || !game) return;
  const max = t.scrollWidth - t.clientWidth;
  const to = Math.min(max, Math.max(0, t.scrollLeft + game.getBoundingClientRect().left - snapLine(t)));
  targets.set(row, index);
  glideScroll(t, { left: to }, () => sync(row));
}

// Track scrolls (scroll events don't bubble): update the row once it pauses / ends.
const onTrackScroll = (e: Event, delay: number) => {
  const t = e.target;
  if (!(t instanceof HTMLElement) || !t.matches('[data-row-track]')) return;
  if ('gliding' in t.dataset) return; // a wheel glide syncs once it arrives
  const row = t.closest<HTMLElement>('[data-row]');
  if (!row) return;
  window.clearTimeout(settleTimers.get(row));
  settleTimers.set(
    row,
    window.setTimeout(() => sync(row), delay),
  );
};
document.addEventListener('scroll', (e) => onTrackScroll(e, SETTLE_MS), {
  capture: true,
  passive: true,
});
document.addEventListener('scrollend', (e) => onTrackScroll(e, 0), {
  capture: true,
});

document.addEventListener('click', (e) => {
  const target = e.target as Element;
  const row = target.closest<HTMLElement>('[data-row]');
  if (!row) return;
  const dot = target.closest<HTMLElement>('[data-row-dot]');
  if (dot) {
    show(row, dots(row).indexOf(dot));
    return;
  }
  // A partly visible game (not its buttons): bring it in.
  if (target.closest('a, button')) return;
  const game = target.closest<HTMLElement>('[data-cf]');
  const index = game ? games(row).indexOf(game) : -1;
  if (index >= 0 && index !== currentIndex(row)) show(row, index);
});

// ← / →: previous / next game in the row holding focus, else in the selected row.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (getRootState('mmenu') === 'open') return;
  const target = e.target as HTMLElement;
  if (target.closest('input, textarea, select, [contenteditable]')) return;
  // One game per press: holding the key doesn't run on through the row (repeats ignored).
  if (e.repeat) {
    if (target.closest('[data-row]') || getScroller()?.querySelector('[data-row].is-active, [data-row][data-arriving]')) {
      e.preventDefault();
    }
    return;
  }
  // A vertical glide decides at once (dom.ts markArriving): the row it's heading to takes
  // the keys already; heading to something else (the Start hero, hero-slider.ts), no row does.
  const arriving = getScroller()?.querySelector<HTMLElement>('[data-arriving]');
  const row =
    target.closest<HTMLElement>('[data-row]') ??
    (arriving
      ? arriving.matches('[data-row]')
        ? arriving
        : null
      : (getScroller()?.querySelector<HTMLElement>('[data-row].is-active') ?? null));
  if (!row) return;
  e.preventDefault();
  const next = (targets.get(row) ?? currentIndex(row)) + (e.key === 'ArrowRight' ? 1 : -1);
  if (next < 0 || next >= games(row).length) return;
  targets.set(row, next);
  show(row, next);
});

// ---------- Wheel: one game per gesture (see top) ----------
let wheelSum = 0;
let wheelDone = false;
/** The wheel gesture (dom.ts wheelGesture) wheelSum / wheelDone belong to. */
let wheelOf = -1;

document.addEventListener(
  'wheel',
  (e) => {
    const t = (e.target as Element | null)?.closest<HTMLElement>('[data-row-track]');
    const row = t?.closest<HTMLElement>('[data-row]');
    // Only sideways gestures (dom.ts wheelAxis: a diagonal swipe doesn't also move the column);
    // vertical ones go to the column (wheel.ts).
    if (!t || !row || e.ctrlKey || wheelAxis() !== 'x') return;
    e.preventDefault();
    const dx = e.deltaX || (e.shiftKey ? e.deltaY : 0);
    if (!dx) return;
    if (wheelGesture() !== wheelOf) {
      wheelOf = wheelGesture();
      wheelSum = 0;
      wheelDone = false;
    }
    if (wheelDone) return;
    wheelSum += e.deltaMode === WheelEvent.DOM_DELTA_LINE ? dx * 16 : dx;
    if (Math.abs(wheelSum) < WHEEL_STEP_PX) return;
    wheelDone = true;
    const next = (targets.get(row) ?? currentIndex(row)) + Math.sign(wheelSum);
    if (next >= 0 && next < games(row).length) show(row, next);
  },
  { capture: true, passive: false },
);

// The user takes over (touch on a track): stop the glide. (Clicks don't: a click on a
// line or a partly visible game takes it over.)
for (const type of ['touchstart'] as const) {
  document.addEventListener(
    type,
    (e) => {
      const t = (e.target as Element | null)?.closest<HTMLElement>('[data-row-track]');
      if (!t) return;
      stopGlide(t);
      const row = t.closest<HTMLElement>('[data-row]');
      if (row) {
        touchingRow = row;
        touchFrom.set(row, targets.get(row) ?? currentIndex(row));
      }
    },
    { capture: true, passive: true },
  );
}
for (const type of ['touchend', 'touchcancel'] as const) {
  document.addEventListener(
    type,
    (e) => {
      if ((e as TouchEvent).touches.length) return;
      const row = touchingRow;
      touchingRow = null;
      // It may already rest (a slow drag): check now; otherwise sync does once it rests.
      const t = row && track(row);
      if (row && t) {
        window.clearTimeout(settleTimers.get(row));
        settleTimers.set(row, window.setTimeout(() => sync(row), SETTLE_MS));
      }
    },
    { capture: true, passive: true },
  );
}
document.addEventListener('astro:before-swap', () => {
  document.querySelectorAll<HTMLElement>('[data-row-track]').forEach(stopGlide);
});

document.addEventListener(ACTIVE_CHANGE, syncAll);
window.addEventListener('resize', syncAll);
onPageLoad(syncAll);
