/**
 * Active container (HANDOFF §6). The column uses CSS `scroll-snap-type: y mandatory`;
 * once scrolling settles, the container closest to the snap line becomes `.is-active`.
 * Keyboard focus inside a container also makes it active.
 */
import { containers, getScroller, onPageLoad, onScrollerScroll, snapOffset } from './dom';

const SETTLE_MS = 90;
let settleTimer = 0;

function setActive(scroller: HTMLElement, active: HTMLElement | undefined) {
  if (!active || active.classList.contains('is-active')) return;
  containers(scroller).forEach((cf) => cf.classList.toggle('is-active', cf === active));
}

function nearestToSnapLine(scroller: HTMLElement) {
  const line = scroller.getBoundingClientRect().top + snapOffset(scroller);
  let best: HTMLElement | undefined;
  let bestDistance = Infinity;
  for (const cf of containers(scroller)) {
    const d = Math.abs(cf.getBoundingClientRect().top - line);
    if (d < bestDistance) {
      bestDistance = d;
      best = cf;
    }
  }
  return best;
}

/** Extra space after the last container so it can snap to the top as well. */
function updateTail(scroller: HTMLElement) {
  const column = scroller.querySelector<HTMLElement>('[data-column]');
  const last = containers(scroller).at(-1);
  if (!column || !last) return;
  const tail = Math.max(0, scroller.clientHeight - snapOffset(scroller) - last.offsetHeight);
  column.style.setProperty('--tail', `${tail}px`);
}

onScrollerScroll((scroller) => {
  window.clearTimeout(settleTimer);
  settleTimer = window.setTimeout(() => setActive(scroller, nearestToSnapLine(scroller)), SETTLE_MS);
});

// `scrollend` (where supported) settles immediately.
document.addEventListener(
  'scrollend',
  (e) => {
    const target = e.target;
    if (target instanceof HTMLElement && target.id === 'scroller') {
      window.clearTimeout(settleTimer);
      setActive(target, nearestToSnapLine(target));
    }
  },
  { capture: true },
);

window.addEventListener('resize', () => {
  const scroller = getScroller();
  if (scroller) updateTail(scroller);
});

onPageLoad(() => {
  const scroller = getScroller();
  if (!scroller) return;
  scroller.scrollTop = 0;
  updateTail(scroller);
  // The scroller is swapped on navigation, so this listener is bound once per page.
  scroller.addEventListener('focusin', (e) => {
    const cf = (e.target as Element).closest<HTMLElement>('[data-cf]');
    if (cf) setActive(scroller, cf);
  });
});
