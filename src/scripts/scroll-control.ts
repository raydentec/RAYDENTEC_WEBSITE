/**
 * Scroll indicator / back to top (HANDOFF §7) and the custom scroll track.
 *   scrollTop 0            → data-state="top"    SCROLL ↓, click snaps to the next container
 *   while/after scrolling  → data-state="scroll" BACK TO TOP ↑, click scrolls to the very top
 *   1.2s without scrolling → data-state="idle"   arrow-only; any scroll re-expands it
 * Like the rail's EXPAND button, hovering (or keyboard focus) also re-expands it; it
 * stays expanded while hovered and collapses 2s after the pointer leaves.
 */
import { containers, getScroller, onPageLoad, onScrollerScroll, scrollBehavior, snapOffset } from './dom';
import { scrollToTop } from './snap';

const IDLE_MS = 1200;
const HOVER_COLLAPSE_MS = 2000;
let idleTimer = 0;
/** Pointer over (or keyboard focus on) the control: don't collapse it. */
let held = false;

const control = () => document.querySelector<HTMLButtonElement>('[data-scroll-ctl]');

function collapseLater(ms: number) {
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => {
    if (!held && control()?.dataset.state === 'scroll') setState('idle');
  }, ms);
}

function setState(state: 'top' | 'scroll' | 'idle') {
  const btn = control();
  if (!btn || btn.dataset.state === state) return;
  btn.dataset.state = state;
  btn.setAttribute('aria-label', state === 'top' ? 'Scroll to next item' : 'Back to top');
}

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
  window.clearTimeout(idleTimer);
  if (scroller.scrollTop <= 0) {
    setState('top');
    return;
  }
  setState('scroll');
  if (!held) collapseLater(IDLE_MS);
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
  if (control()?.dataset.state === 'top') {
    // Snap to the next container below the snap line.
    const line = scroller.getBoundingClientRect().top + snapOffset(scroller);
    const next = containers(scroller).find((cf) => cf.getBoundingClientRect().top > line + 2);
    if (next) scroller.scrollBy({ top: next.getBoundingClientRect().top - line, behavior: scrollBehavior() });
  } else {
    scrollToTop(scroller);
  }
});

window.addEventListener('resize', () => {
  const scroller = getScroller();
  if (scroller) updateTrack(scroller);
});

onPageLoad(() => {
  window.clearTimeout(idleTimer);
  setState('top');
  const scroller = getScroller();
  if (scroller) updateTrack(scroller);
});
