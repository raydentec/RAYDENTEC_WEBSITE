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
 * Touch swipes scroll natively, but stop at the next game (scroll-snap-stop, GameRow.astro).
 * Every switch — swipe, key, wheel, click — counts at once: the row's target (and lit game)
 * moves on as it starts, so the next input goes on from there (quick swipes add up; see
 * `touch` below). The ← / → keys move one game per press (holding one doesn't run on).
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

/**
 * A touch swipe on a row (native scrolling): the game it counts from — the one a switch
 * still under way heads to, else the one at rest — and, once the finger has moved
 * SWIPE_DECIDE_PX sideways, its direction (from the finger: the row itself may still be
 * moving). From then the row's target is the next game (its line lit at once), so the next
 * swipe, key or wheel already goes on from there. A swipe that began while a switch was
 * under way (`chained`) keeps the row's snapping paused (it would snap back meanwhile) and
 * glides to its target when let go (or back, not swiped); one from rest is left to the
 * browser (scroll-snap-stop stops it at the next game).
 */
const SWIPE_DECIDE_PX = 10;
let touch: { row: HTMLElement; base: number; x0: number; y0: number; chained: boolean; dir: number } | null = null;
/** Rows a touch swipe has let go of, still settling (the browser's own snapping). */
const settlingTouch = new WeakSet<HTMLElement>();

/**
 * Light a game as the row's current one: its indicator line, and (`select`, once the row
 * rests) its selected look while the row is selected. Not mid-switch: that changes the
 * frames' layout, and the browser re-snapped the moving row back to where it was.
 */
function light(row: HTMLElement, index: number, select = false) {
  if (select) {
    const active = row.classList.contains('is-active');
    games(row).forEach((game, i) => game.classList.toggle('is-active', active && i === index));
  }
  dots(row).forEach((dot, i) => {
    if (i === index) dot.setAttribute('aria-current', 'true');
    else dot.removeAttribute('aria-current');
  });
}

function sync(row: HTMLElement) {
  if (touch?.row === row) return; // a finger is still on it (touchend syncs)
  settlingTouch.delete(row);
  targets.delete(row);
  light(row, currentIndex(row), true);
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
  light(row, index); // the switch counts at once (see touch above)
  // A settle check still pending from earlier scrolling would clear the target mid-glide.
  window.clearTimeout(settleTimers.get(row));
  // Right after a touch swipe, by script (its snapping paused): the browser's own pending
  // snap would pull the row back to the swipe's game (dom.ts glideScroll).
  const afterTouch = settlingTouch.has(row);
  settlingTouch.delete(row);
  glideScroll(t, { left: to }, () => sync(row), undefined, afterTouch);
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
      const row = t.closest<HTMLElement>('[data-row]');
      if (!row) return;
      const chained = targets.has(row);
      stopGlide(t);
      if (chained) t.dataset.gliding = ''; // snapping stays paused (see touch above)
      const f = (e as TouchEvent).touches[0];
      touch = { row, base: targets.get(row) ?? currentIndex(row), x0: f.clientX, y0: f.clientY, chained, dir: 0 };
    },
    { capture: true, passive: true },
  );
}
// The finger has moved far enough sideways: the swipe's target is the next game that way.
document.addEventListener(
  'touchmove',
  (e) => {
    if (!touch || touch.dir) return;
    const f = e.touches[0];
    const dx = f.clientX - touch.x0;
    if (Math.abs(dx) < SWIPE_DECIDE_PX || Math.abs(dx) < Math.abs(f.clientY - touch.y0)) return;
    touch.dir = dx < 0 ? 1 : -1; // finger to the left: on to the next game
    const to = Math.max(0, Math.min(games(touch.row).length - 1, touch.base + touch.dir));
    targets.set(touch.row, to);
    light(touch.row, to);
  },
  { capture: true, passive: true },
);
for (const type of ['touchend', 'touchcancel'] as const) {
  document.addEventListener(
    type,
    (e) => {
      if ((e as TouchEvent).touches.length || !touch) return;
      const { row, chained, base } = touch;
      touch = null;
      // Begun while a switch was under way: on to its target (the browser would stop at the
      // earlier one), or back to where it counted from if it wasn't swiped. From rest: the
      // browser's snapping settles it.
      if (chained) {
        settlingTouch.add(row); // by script: its snapping is still paused (show)
        show(row, targets.get(row) ?? base);
        return;
      }
      settlingTouch.add(row);
      window.clearTimeout(settleTimers.get(row));
      settleTimers.set(row, window.setTimeout(() => sync(row), SETTLE_MS));
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
