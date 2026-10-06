/**
 * Games rows (GameRow.astro). Each row's games scroll sideways in its
 * track (CSS x-snapping). The game resting at the row's left edge is the row's current
 * one: its indicator line is lit and — while the row is the active container (snap.ts)
 * — it shows as selected (`.is-active`). Clicking an indicator line or a partly visible
 * game scrolls the row to that game. The ← / → keys step through the selected row's
 * games — no need to click or focus it first. Also drives the Start page's explore row.
 */
import { ACTIVE_CHANGE, getRootState, getScroller, onPageLoad, scrollBehavior } from './dom';

const SETTLE_MS = 90;
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

document.addEventListener(ACTIVE_CHANGE, syncAll);
window.addEventListener('resize', syncAll);
onPageLoad(syncAll);
