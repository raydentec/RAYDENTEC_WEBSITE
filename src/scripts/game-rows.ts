/**
 * Games rows (GameRow.astro). Each row's games scroll sideways in its
 * track (CSS x-snapping). The game resting at the row's left edge is the row's current
 * one: its indicator line is lit and — while the row is the active container (snap.ts)
 * — it shows as selected (`.is-active`). Clicking an indicator line or a partly visible
 * game scrolls the row to that game. The ← / → keys step through the selected row's
 * games — no need to click or focus it first. Also drives the Start page's explore row.
 *
 * Sideways wheel / trackpad / Shift+wheel over a track doesn't scroll it natively: each
 * gesture glides one game on by script — GLIDE_MS with Chrome's smooth-scroll curve
 * (dom.ts CHROME_EASE), snapping paused (data-gliding, GameRow.astro) — and the rest of
 * the gesture (further notches, trackpad momentum) is swallowed until the input has
 * stopped for INPUT_REST_MS. Left to the browser, Chrome switched in a quick jerk and
 * Safari's glide stuttered as each further wheel event cut into it (as the column did,
 * wheel.ts). A new gesture during a glide carries on from the game it heads to; touching
 * the track stops it.
 */
import { ACTIVE_CHANGE, CHROME_EASE, getRootState, getScroller, mq, onPageLoad, scrollBehavior } from './dom';

const SETTLE_MS = 90;
const GLIDE_MS = 625;
/** A wheel gesture (incl. trackpad momentum) has ended when no event came for this long. */
const INPUT_REST_MS = 200;
/** Sideways wheel travel that switches a game. */
const WHEEL_STEP_PX = 30;
const settleTimers = new WeakMap<HTMLElement, number>();
/** Game a row is gliding to after ← / →, so quick presses add up (cleared once it rests). */
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

function sync(row: HTMLElement) {
  targets.delete(row);
  const current = currentIndex(row);
  const active = row.classList.contains('is-active');
  games(row).forEach((game, i) => game.classList.toggle('is-active', active && i === current));
  dots(row).forEach((dot, i) => {
    if (i === current) dot.setAttribute('aria-current', 'true');
    else dot.removeAttribute('aria-current');
  });
}

const syncAll = () => rows().forEach(sync);

function show(row: HTMLElement, index: number) {
  const t = track(row);
  const game = games(row)[index];
  if (!t || !game) return;
  t.scrollBy({
    left: game.getBoundingClientRect().left - snapLine(t),
    behavior: scrollBehavior(),
  });
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
  const row =
    target.closest<HTMLElement>('[data-row]') ?? getScroller()?.querySelector<HTMLElement>('[data-row].is-active');
  if (!row) return;
  e.preventDefault();
  const next = (targets.get(row) ?? currentIndex(row)) + (e.key === 'ArrowRight' ? 1 : -1);
  if (next < 0 || next >= games(row).length) return;
  targets.set(row, next);
  show(row, next);
});

// ---------- Wheel: one game per gesture (see top) ----------
let glideFrame = 0;
let glideTrack: HTMLElement | null = null;
let wheelSum = 0;
let wheelDone = false;
let wheelRestTimer = 0;

/** Stop a running glide where it is; snapping takes over again. */
function stopGlide() {
  if (!glideFrame) return;
  cancelAnimationFrame(glideFrame);
  glideFrame = 0;
  if (glideTrack) delete glideTrack.dataset.gliding;
  glideTrack = null;
}

/** Glide the row's track to a game (as far as the track scrolls), then sync the row. */
function glideTo(row: HTMLElement, index: number) {
  const t = track(row);
  const game = games(row)[index];
  if (!t || !game) return;
  // A running glide hands over where it is, snapping still paused.
  cancelAnimationFrame(glideFrame);
  glideFrame = 0;
  if (glideTrack && glideTrack !== t) delete glideTrack.dataset.gliding;
  const from = t.scrollLeft;
  const max = t.scrollWidth - t.clientWidth;
  const to = Math.min(max, Math.max(0, from + game.getBoundingClientRect().left - snapLine(t)));
  if (mq.reducedMotion.matches || Math.abs(to - from) < 1) {
    delete t.dataset.gliding;
    glideTrack = null;
    t.scrollTo({ left: to, behavior: 'instant' });
    sync(row);
    return;
  }
  targets.set(row, index);
  t.dataset.gliding = '';
  glideTrack = t;
  const start = performance.now();
  const frame = (now: number) => {
    const p = Math.min(1, (now - start) / GLIDE_MS);
    t.scrollTo({ left: from + (to - from) * CHROME_EASE(p), behavior: 'instant' });
    if (p < 1) {
      glideFrame = requestAnimationFrame(frame);
      return;
    }
    glideFrame = 0;
    glideTrack = null;
    delete t.dataset.gliding;
    sync(row);
  };
  glideFrame = requestAnimationFrame(frame);
}

document.addEventListener(
  'wheel',
  (e) => {
    const t = (e.target as Element | null)?.closest<HTMLElement>('[data-row-track]');
    const row = t?.closest<HTMLElement>('[data-row]');
    if (!t || !row || e.ctrlKey) return;
    const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
    if (!dx) return; // vertical: the column (wheel.ts)
    e.preventDefault();
    window.clearTimeout(wheelRestTimer);
    wheelRestTimer = window.setTimeout(() => {
      wheelSum = 0;
      wheelDone = false;
    }, INPUT_REST_MS);
    if (wheelDone) return;
    wheelSum += e.deltaMode === WheelEvent.DOM_DELTA_LINE ? dx * 16 : dx;
    if (Math.abs(wheelSum) < WHEEL_STEP_PX) return;
    wheelDone = true;
    const next = (targets.get(row) ?? currentIndex(row)) + Math.sign(wheelSum);
    if (next >= 0 && next < games(row).length) glideTo(row, next);
  },
  { capture: true, passive: false },
);

// The user takes over (touch, pointer on a track): stop the glide.
for (const type of ['touchstart', 'pointerdown'] as const) {
  document.addEventListener(
    type,
    (e) => {
      if ((e.target as Element | null)?.closest('[data-row-track]')) stopGlide();
    },
    { capture: true, passive: true },
  );
}
document.addEventListener('astro:before-swap', stopGlide);

document.addEventListener(ACTIVE_CHANGE, syncAll);
window.addEventListener('resize', syncAll);
onPageLoad(syncAll);
