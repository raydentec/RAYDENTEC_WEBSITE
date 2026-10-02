/**
 * Scroll indicator / back to top (HANDOFF §7) and the custom scroll track.
 *   scrollTop 0            → data-state="top"    SCROLL ↓, click snaps to the next container
 *   while/after scrolling  → data-state="scroll" BACK TO TOP ↑, click scrolls to the very top
 *   1.2s without scrolling → data-state="idle"   arrow-only; any scroll re-expands it
 */
import { containers, getScroller, onPageLoad, onScrollerScroll, scrollBehavior, snapOffset } from './dom';
import { scrollToTop } from './snap';

const IDLE_MS = 1200;
let idleTimer = 0;

const control = () => document.querySelector<HTMLButtonElement>('[data-scroll-ctl]');

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
  idleTimer = window.setTimeout(() => setState('idle'), IDLE_MS);
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
