/**
 * Active container (HANDOFF §6). The column uses CSS `scroll-snap-type: y mandatory`;
 * once scrolling settles, the container closest to the snap line becomes `.is-active`.
 * Keyboard focus inside a container also makes it active.
 *
 * Mobile: the profile block above the containers scrolls freely. Snapping is only
 * switched on (#scroller[data-snap="on"]) once container 1 is about to activate,
 * i.e. its top has passed the middle of the visible area between the header line
 * and the scroll control.
 */
import {
  ACTIVE_CHANGE,
  containers,
  getScroller,
  mq,
  onPageLoad,
  onScrollerScroll,
  scrollBehavior,
  snapOffset,
} from './dom';

const SETTLE_MS = 90;
let settleTimer = 0;

function setActive(scroller: HTMLElement, active: HTMLElement | undefined) {
  if (!active || active.classList.contains('is-active')) return;
  const all = containers(scroller);
  all.forEach((cf) => cf.classList.toggle('is-active', cf === active));
  document.dispatchEvent(new CustomEvent(ACTIVE_CHANGE, { detail: { index: all.indexOf(active) } }));
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

/** True while a back-to-top scroll is running: snapping stays off until it reaches 0. */
let returningToTop = false;

function updateSnapping(scroller: HTMLElement) {
  if (returningToTop) {
    if (scroller.scrollTop > 0) return;
    returningToTop = false;
  }
  const first = containers(scroller)[0];
  let on = true;
  if (mq.mobile.matches && first) {
    const line = scroller.getBoundingClientRect().top + snapOffset(scroller);
    const bottom =
      document.querySelector('[data-scroll-ctl]')?.getBoundingClientRect().top ?? scroller.getBoundingClientRect().bottom;
    on = first.getBoundingClientRect().top <= (line + bottom) / 2;
  }
  const value = on ? 'on' : 'off';
  if (scroller.dataset.snap !== value) scroller.dataset.snap = value;
}

/**
 * Scroll to the very top of the page. On mobile the profile above the containers has
 * no snap point, so snapping is held off for the whole trip — otherwise the browser
 * would snap the target onto container 1.
 */
export function scrollToTop(scroller: HTMLElement) {
  if (scroller.scrollTop <= 0) return;
  returningToTop = true;
  scroller.dataset.snap = 'off';
  scroller.scrollTo({ top: 0, behavior: scrollBehavior() });
}

onScrollerScroll((scroller) => {
  updateSnapping(scroller);
  window.clearTimeout(settleTimer);
  settleTimer = window.setTimeout(() => setActive(scroller, nearestToSnapLine(scroller)), SETTLE_MS);
});

// `scrollend` (where supported) settles immediately.
document.addEventListener(
  'scrollend',
  (e) => {
    const target = e.target;
    if (target instanceof HTMLElement && target.id === 'scroller') {
      // A back-to-top scroll interrupted by the user ends here: resume normal snapping.
      returningToTop = false;
      updateSnapping(target);
      window.clearTimeout(settleTimer);
      setActive(target, nearestToSnapLine(target));
    }
  },
  { capture: true },
);

window.addEventListener('resize', () => {
  const scroller = getScroller();
  if (!scroller) return;
  updateTail(scroller);
  updateSnapping(scroller);
});

onPageLoad(() => {
  const scroller = getScroller();
  if (!scroller) return;
  returningToTop = false;
  scroller.scrollTop = 0;
  updateTail(scroller);
  updateSnapping(scroller);
  // The scroller is swapped on navigation, so this listener is bound once per page.
  scroller.addEventListener('focusin', (e) => {
    const cf = (e.target as Element).closest<HTMLElement>('[data-cf]');
    if (cf) setActive(scroller, cf);
  });
});
