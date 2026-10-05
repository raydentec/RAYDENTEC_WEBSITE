/**
 * Active container (HANDOFF §6). The column uses CSS `scroll-snap-type: y mandatory`;
 * once scrolling settles, the container closest to the snap line becomes `.is-active`.
 * Keyboard focus inside a container also makes it active.
 *
 * Mobile: the profile block above the containers scrolls freely. Snapping is only
 * switched on (#scroller[data-snap="on"]) once container 1 is about to activate,
 * i.e. its top has passed the middle of the visible area between the header line
 * and the scroll control.
 *
 * Containers taller than the visible area (short phones) can be scrolled freely
 * inside, so the browser may come to rest part-way into the next or previous one.
 * Switching to another container therefore always re-aligns its top to the snap line.
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

const snapLine = (scroller: HTMLElement) => scroller.getBoundingClientRect().top + snapOffset(scroller);

function nearestToSnapLine(scroller: HTMLElement) {
  const line = snapLine(scroller);
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

/** The container the snap line currently runs through (a tall one can span it). */
function containerAtSnapLine(scroller: HTMLElement) {
  const line = snapLine(scroller) + 1;
  return containers(scroller).find((cf) => {
    const r = cf.getBoundingClientRect();
    return r.top <= line && r.bottom > line;
  });
}

/** The container the user last came to rest in (free scrolling inside it is fine). */
let home: HTMLElement | null = null;
const SUPPORTS_SCROLLEND = 'onscrollend' in window;

/**
 * Scrolling has come to rest: activate the container at the snap line. When `align`
 * is set and that is a different container than the last one rested in, align its
 * top to the snap line.
 */
function settle(scroller: HTMLElement, align: boolean) {
  window.clearTimeout(settleTimer);
  const target = containerAtSnapLine(scroller) ?? nearestToSnapLine(scroller);
  if (!target) return;
  setActive(scroller, target);
  // Wheel input forwarded from outside the column settles itself (wheel.ts).
  if (!align || 'wheel' in scroller.dataset) return;
  if (scroller.dataset.snap === 'off' || returningToTop) {
    home = null; // in the free-scrolling profile area
    return;
  }
  if (target === home) return;
  home = target;
  const offset = target.getBoundingClientRect().top - snapLine(scroller);
  if (Math.abs(offset) > 1) scroller.scrollBy({ top: offset, behavior: scrollBehavior() });
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
  // Highlight as soon as scrolling pauses; aligning waits for `scrollend` (the timer
  // also fires during slow flings) unless the browser doesn't support it.
  settleTimer = window.setTimeout(() => settle(scroller, !SUPPORTS_SCROLLEND), SETTLE_MS);
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
      settle(target, true);
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

/**
 * Mobile, switching pages: every page except Start opens with container 1 selected and
 * snapped under the header (Start opens at the top, with the profile). Done on swap,
 * before the page transition captures the new page, so it doesn't fade in at the top
 * and then jump.
 */
let positionedOnSwap = false;
document.addEventListener('astro:after-swap', () => {
  positionedOnSwap = false;
  const scroller = getScroller();
  const first = scroller ? containers(scroller)[0] : undefined;
  if (!scroller || !first || !mq.mobile.matches || scroller.dataset.page === 'start') return;
  returningToTop = false;
  scroller.dataset.snap = 'on';
  scroller.scrollTop += first.getBoundingClientRect().top - snapLine(scroller);
  home = first;
  setActive(scroller, first);
  positionedOnSwap = true;
});

onPageLoad(() => {
  const scroller = getScroller();
  if (!scroller) return;
  returningToTop = false;
  if (!positionedOnSwap) {
    home = null;
    scroller.scrollTop = 0;
  }
  positionedOnSwap = false;
  updateTail(scroller);
  updateSnapping(scroller);
  // The scroller is swapped on navigation, so this listener is bound once per page.
  scroller.addEventListener('focusin', (e) => {
    const cf = containers(scroller).find((c) => c.contains(e.target as Node));
    if (cf) setActive(scroller, cf);
  });
});
