/**
 * Shared helpers for the shell scripts.
 *
 * Scripts are bundled modules, so their top level runs once per full page load.
 * Listeners on document/window and on `transition:persist` elements are bound
 * there; anything inside the swapped content column (#scroller) is re-read on
 * every `astro:page-load`.
 */

export const mq = {
  desktop: matchMedia('(min-width: 1280px)'),
  mobile: matchMedia('(max-width: 767px)'),
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)'),
};

export const getScroller = () => document.getElementById('scroller');

export const scrollBehavior = (): ScrollBehavior => (mq.reducedMotion.matches ? 'auto' : 'smooth');

/**
 * UI state lives in data-* attributes on <html> so CSS can react to it.
 * ClientRouter replaces <html>'s attributes on every swap, so re-apply them.
 */
const rootState = new Map<string, string | null>();

function applyRootState(key: string, value: string | null) {
  if (value === null) delete document.documentElement.dataset[key];
  else document.documentElement.dataset[key] = value;
}

export function setRootState(key: string, value: string | null) {
  rootState.set(key, value);
  applyRootState(key, value);
}

export const getRootState = (key: string) => rootState.get(key) ?? document.documentElement.dataset[key] ?? null;

document.addEventListener('astro:after-swap', () => rootState.forEach((v, k) => applyRootState(k, v)));

/** Scroll events don't bubble; one capturing listener fans out scroller scrolls. */
type ScrollHandler = (scroller: HTMLElement) => void;
const scrollHandlers: ScrollHandler[] = [];
document.addEventListener(
  'scroll',
  (e) => {
    const target = e.target;
    if (target instanceof HTMLElement && target.id === 'scroller') scrollHandlers.forEach((h) => h(target));
  },
  { capture: true, passive: true },
);
export const onScrollerScroll = (handler: ScrollHandler) => scrollHandlers.push(handler);

export const onPageLoad = (handler: () => void) => document.addEventListener('astro:page-load', handler);

/** Distance (px) from the scroller's top edge to where containers snap. */
export function snapOffset(scroller: HTMLElement) {
  return parseFloat(getComputedStyle(scroller).scrollPaddingTop) || 0;
}

export const containers = (scroller: HTMLElement) => Array.from(scroller.querySelectorAll<HTMLElement>('[data-cf]'));

/** Fired on document by snap.ts when the active container changes; detail = its index. */
export const ACTIVE_CHANGE = 'raydentec:active-change';
export type ActiveChangeEvent = CustomEvent<{ index: number }>;

/** Index of the active (snapped) container in the current column, or -1. */
export function activeIndex() {
  const scroller = getScroller();
  return scroller ? containers(scroller).findIndex((cf) => cf.classList.contains('is-active')) : -1;
}
