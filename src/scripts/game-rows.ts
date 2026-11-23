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
 * Touch swipes move one game each, decided when let go (`touch` below). Every switch —
 * swipe, key, wheel, click — counts at once: the row's target (and its line) moves on as it
 * starts, so the next input goes on from there (quick swipes add up). The ← / → keys move
 * one game per press (holding one doesn't run on).
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
  SCRIPT_GLIDES,
  getRootState,
  stopEdgeBounce,
  releaseSpeed,
  stopMomentum,
  swipeDirection,
  touchedRecently,
  getScroller,
  glideScroll,
  onPageLoad,
  stopGlide,
  wheelAxis,
  wheelGesture,
} from './dom';
import { bindIosSwipe, IOS_TOUCH } from './ios-swipe';

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
 * Touch (phones): the track follows the finger natively (its snapping paused meanwhile, and
 * its line left as it is); let go, the row moves one game at most — to the next or previous
 * one of the game it counts from (`base`: the one a switch still under way heads to, else
 * the one at rest) when swiped far enough for its speed (a fast swipe a little, a slow drag
 * past half a game: dom.ts swipeDirection), else back to it — by script, the browser's own
 * fling stopped first (dom.ts stopMomentum). Its line changes then. So a swipe never runs
 * on past one game, and quick swipes add up.
 */
let touch: { row: HTMLElement; base: number; left0: number } | null = null;

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
  if (touch?.row === row) return; // a finger is still on it (touchend decides)
  targets.delete(row);
  light(row, currentIndex(row), true);
}

const syncAll = () => rows().forEach(sync);

/** Glide the row's track to a game (as far as the track scrolls), then sync the row. */
/** `v0`: the speed it's moving at (a touch swipe let go), carried on smoothly (dom.ts releaseEase). */
function show(row: HTMLElement, index: number, v0 = 0) {
  const t = track(row);
  const game = games(row)[index];
  if (!t || !game) return;
  const max = t.scrollWidth - t.clientWidth;
  const to = Math.min(max, Math.max(0, t.scrollLeft + game.getBoundingClientRect().left - snapLine(t)));
  targets.set(row, index);
  light(row, index); // the switch counts at once: the next input goes on from it
  // A settle check still pending from earlier scrolling would clear the target mid-glide.
  window.clearTimeout(settleTimers.get(row));
  // After touch (a swipe let go, a tapped line): any fling stopped, then by script — the
  // browser's own scrolling / snapping fought a native smooth scroll there (jumpy).
  const touched = touchedRecently();
  if (touched) stopMomentum(t);
  glideScroll(t, { left: to }, () => sync(row), undefined, touched, v0);
}

// Track scrolls (scroll events don't bubble): update the row once it pauses / ends.
const onTrackScroll = (e: Event, delay: number) => {
  const t = e.target;
  if (!(t instanceof HTMLElement) || !t.matches('[data-row-track]')) return;
  const row = t.closest<HTMLElement>('[data-row]');
  if (!row) return;
  if ('gliding' in t.dataset || touch?.row === row) return; // a glide / touchend settles it
  // No switch under way (the browser's own scrolling): the line follows the row.
  if (!targets.has(row)) light(row, currentIndex(row));
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

// A finger on a track: its glide stops, and its snapping is paused until let go (see touch).
document.addEventListener(
  'touchstart',
  (e) => {
    if (IOS_TOUCH) return; // iOS: ios-swipe.ts (below)
    const t = (e.target as Element | null)?.closest<HTMLElement>('[data-row-track]');
    const row = t?.closest<HTMLElement>('[data-row]');
    if (!t || !row || e.touches.length !== 1) return;
    const moving = targets.has(row);
    const base = targets.get(row) ?? currentIndex(row);
    stopGlide(t);
    // Mid-switch: snapping paused (it would snap the track back meanwhile). From rest, in
    // Chromium it stays on: its own fling, which gets a frame in before the release glide
    // takes over, then aims at the next game (scroll-snap-stop) instead of flying past it.
    // Elsewhere (WebKit) always paused: its own snapping interfered from the drag's start.
    if (moving || SCRIPT_GLIDES) t.dataset.gliding = '';
    touch = { row, base, left0: t.scrollLeft };
  },
  { capture: true, passive: true },
);
for (const type of ['touchend', 'touchcancel'] as const) {
  document.addEventListener(
    type,
    (e) => {
      if (!touch || (e as TouchEvent).touches.length) return;
      const { row, base, left0 } = touch;
      touch = null;
      const t = track(row);
      if (!t) return;
      const f = (e as TouchEvent).changedTouches[0];
      const moved = t.scrollLeft - left0;
      // Not moved sideways (a tap, a vertical drag) and nothing under way: as it was — but
      // synced now: a vertical swipe begun on it may have moved the selection to another
      // section meanwhile (sync skipped it while the finger was down), which left its game
      // looking selected.
      if (Math.abs(moved) < 1 && !targets.has(row)) {
        delete t.dataset.gliding;
        sync(row);
        return;
      }
      // One game at most, if swiped far enough for its speed (dom.ts swipeDirection).
      const g = games(row);
      const step = g.length > 1 ? g[1].getBoundingClientRect().left - g[0].getBoundingClientRect().left : t.clientWidth;
      const dir = swipeDirection(f, moved, step);
      show(row, Math.max(0, Math.min(g.length - 1, base + dir)), releaseSpeed());
    },
    { capture: true, passive: true },
  );
}
document.addEventListener('astro:before-swap', () => {
  document.querySelectorAll<HTMLElement>('[data-row-track]').forEach(stopGlide);
});

document.addEventListener(ACTIVE_CHANGE, syncAll);
window.addEventListener('resize', () => {
  // iOS: no snapping on the tracks (ios-swipe.ts) — put each back on its game.
  if (IOS_TOUCH) {
    rows().forEach((row) => {
      const t = track(row);
      const g = games(row)[targets.get(row) ?? currentIndex(row)];
      if (t && g) t.scrollTo({ left: t.scrollLeft + g.getBoundingClientRect().left - snapLine(t), behavior: 'instant' });
    });
  }
  syncAll();
});

// iOS touch: the drag by script, one game at most (ios-swipe.ts); let go, the glide (show).
bindIosSwipe('[data-row-track]', {
  start(t) {
    const row = t.closest<HTMLElement>('[data-row]');
    const g = row ? games(row) : [];
    if (!row || !g.length) return null;
    const base = targets.get(row) ?? currentIndex(row);
    stopGlide(t);
    t.dataset.gliding = ''; // the row's own scroll handling waits (onTrackScroll)
    const max = t.scrollWidth - t.clientWidth;
    const at = (i: number) => Math.min(max, Math.max(0, t.scrollLeft + g[i].getBoundingClientRect().left - snapLine(t)));
    return {
      base,
      min: at(Math.max(0, base - 1)),
      max: at(Math.min(g.length - 1, base + 1)),
      step: g.length > 1 ? g[1].getBoundingClientRect().left - g[0].getBoundingClientRect().left : t.clientWidth,
    };
  },
  release(t, base, dir, v0) {
    const row = t.closest<HTMLElement>('[data-row]');
    if (row) show(row, Math.max(0, Math.min(games(row).length - 1, base + dir)), v0);
  },
  cancel(t, base) {
    const row = t.closest<HTMLElement>('[data-row]');
    delete t.dataset.gliding;
    if (row && targets.has(row)) show(row, base); // a switch it interrupted: on with it
  },
});
onPageLoad(() => {
  syncAll();
  rows().forEach((row) => {
    const t = track(row);
    if (t && !IOS_TOUCH) stopEdgeBounce(t); // no rubber-band at the ends (dom.ts; iOS: ios-swipe.ts)
  });
});
