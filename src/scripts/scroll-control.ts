/**
 * Scroll indicator / back to top (HANDOFF §7) and the custom scroll track.
 *
 * Mode (data-mode) — what a click does:
 *   "down" SCROLL ↓       snap to the next container; until the last one is selected
 *   "up"   BACK TO TOP ↑  scroll to the very top; once the last container is selected
 * Size (data-state):
 *   scrollTop 0     → "top"    full width
 *   scrolled        → "idle"   arrow-only; scrolling doesn't expand it
 *   hovered/focused → "scroll" full width (like the rail's EXPAND button); collapses
 *                              2s after the pointer leaves
 *   last container  → "scroll" full width BACK TO TOP, kept open
 */
import {
  ACTIVE_CHANGE,
  activeIndex,
  containers,
  getScroller,
  onPageLoad,
  onScrollerScroll,
  scrollBehavior,
  snapOffset,
  snapTop,
} from './dom';
import { scrollToTop } from './snap';

const HOVER_COLLAPSE_MS = 2000;
let idleTimer = 0;
/** Pointer over (or keyboard focus on) the control: don't collapse it. */
let held = false;

const control = () => document.querySelector<HTMLButtonElement>('[data-scroll-ctl]');

/** Last container selected: BACK TO TOP stays expanded (all layouts). */
const keepOpen = () => control()?.dataset.mode === 'up';

function collapseLater(ms: number) {
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => {
    if (!held && !keepOpen() && control()?.dataset.state === 'scroll') setState('idle');
  }, ms);
}

function setState(state: 'top' | 'scroll' | 'idle') {
  const btn = control();
  if (!btn || btn.dataset.state === state) return;
  btn.dataset.state = state;
}

/** BACK TO TOP once the last container is selected (and the page is scrolled), else SCROLL. */
function updateMode() {
  const btn = control();
  const scroller = getScroller();
  if (!btn || !scroller) return;
  const last = containers(scroller).length - 1;
  const mode = last >= 0 && activeIndex() === last && scroller.scrollTop > 0 ? 'up' : 'down';
  if (btn.dataset.mode === mode) return;
  btn.dataset.mode = mode;
  btn.setAttribute('aria-label', mode === 'up' ? 'Back to top' : 'Scroll to next item');
  if (scroller.scrollTop <= 0) return;
  if (keepOpen()) {
    // Last container reached: expand and keep it open.
    window.clearTimeout(idleTimer);
    setState('scroll');
  } else if (mode === 'down' && !held && btn.dataset.state === 'scroll') {
    // Left the last container: back to the collapsed arrow (scrolling doesn't expand it).
    setState('idle');
  }
}
document.addEventListener(ACTIVE_CHANGE, updateMode);

function updateTrack(scroller: HTMLElement) {
  const thumb = document.querySelector<HTMLElement>('[data-track-thumb]');
  const track = thumb?.parentElement;
  if (!thumb || !track) return;
  const { scrollTop, scrollHeight, clientHeight } = scroller;
  const trackH = track.clientHeight;
  const thumbH = scrollHeight > 0 ? Math.min(trackH, (trackH * clientHeight) / scrollHeight) : trackH;
  const max = scrollHeight - clientHeight;
  const y = max > 0 ? ((trackH - thumbH) * scrollTop) / max : 0;
  thumb.style.height = `${thumbH}px`;
  thumb.style.transform = `translateY(${y}px)`;
}

onScrollerScroll((scroller) => {
  updateTrack(scroller);
  if (scroller.scrollTop <= 0) {
    window.clearTimeout(idleTimer);
    setState('top');
    updateMode();
    return;
  }
  // Leaving the top collapses it (unless hovered); scrolling never expands it. A pending
  // 2s collapse after hover keeps running.
  const state = control()?.dataset.state;
  if (state === 'top') setState(held || keepOpen() ? 'scroll' : 'idle');
});

/* ---------- Hover / keyboard focus: expand, collapse 2s after leaving ---------- */

function hold() {
  held = true;
  window.clearTimeout(idleTimer);
  if (control()?.dataset.state === 'idle') setState('scroll');
}

function release() {
  held = false;
  collapseLater(HOVER_COLLAPSE_MS);
}

document.addEventListener('pointerover', (e) => {
  if ((e.target as Element | null)?.closest('[data-scroll-ctl]')) hold();
});
document.addEventListener('pointerout', (e) => {
  const btn = (e.target as Element | null)?.closest('[data-scroll-ctl]');
  if (btn && !btn.contains(e.relatedTarget as Node | null) && !btn.matches(':focus-visible')) release();
});
document.addEventListener('focusin', (e) => {
  if ((e.target as Element | null)?.closest('[data-scroll-ctl]')?.matches(':focus-visible')) hold();
});
document.addEventListener('focusout', (e) => {
  const btn = (e.target as Element | null)?.closest('[data-scroll-ctl]');
  if (btn && !btn.matches(':hover')) release();
});

document.addEventListener('click', (e) => {
  if (!(e.target as Element | null)?.closest('[data-scroll-ctl]')) return;
  const scroller = getScroller();
  if (!scroller) return;
  if (control()?.dataset.mode === 'up') {
    scrollToTop(scroller);
    return;
  }
  // Snap to the next container below the snap line.
  const line = scroller.getBoundingClientRect().top + snapOffset(scroller);
  const next = containers(scroller).find((cf) => snapTop(cf) > line + 2);
  if (next) scroller.scrollBy({ top: snapTop(next) - line, behavior: scrollBehavior() });
});

window.addEventListener('resize', () => {
  const scroller = getScroller();
  if (scroller) updateTrack(scroller);
});

/** A new page starts at the top (SCROLL) — or, on mobile, at container 1 (snap.ts). */
function syncToStart() {
  window.clearTimeout(idleTimer);
  const scroller = getScroller();
  if (!scroller) return;
  updateTrack(scroller);
  updateMode();
  if (scroller.scrollTop > 0) setState(held || keepOpen() ? 'scroll' : 'idle');
  else setState('top');
}
document.addEventListener('astro:after-swap', syncToStart);
onPageLoad(syncToStart);
