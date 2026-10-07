/**
 * Page changes (global.css, "Changing pages"), set on <html> after the swap — the swap
 * replaces <html>'s attributes, and the transition's animations start after that:
 *
 * - The columns' layer names (page-<id>, from data-vt-name) are only set while a page change
 *   runs: a view-transition-name makes the column a backdrop root, which would keep the
 *   backdrop blurs inside it (Community "Social Accounts", the Start lower third) from
 *   seeing the background video behind it.
 * - Direction: --page-shift, by the pages' order in the top menu — going right moves the
 *   pages down by the content top (as far as the column's top edge moves between Start and
 *   Games), going left moves them up, the same page doesn't slide.
 * - data-chrome-fade="<before>-<after>" when the change shows or hides the rail / sidebar,
 *   so they cross-fade; otherwise they stay still. What shows: desktop — the sidebar
 *   (every page but Start opens with it), the rail once it is closed, neither on the Start
 *   hero; tablet — the rail, the sidebar while its overlay is open, neither on the Start
 *   hero; mobile — neither.
 */
import { getRootState, getScroller, isStartPage, mq } from './dom';

type Chrome = 'none' | 'rail' | 'sidebar';

let from = -1;
let chromeBefore: Chrome = 'none';
const order = () => Array.from(document.querySelectorAll<HTMLElement>('.topnav__link')).map((a) => a.dataset.page);

function chromeNow(): Chrome {
  if (mq.mobile.matches || getRootState('heroActive') !== null) return 'none';
  if (mq.desktop.matches) return getRootState('sidebar') === 'collapsed' ? 'rail' : 'sidebar';
  return getRootState('overlay') === 'open' ? 'sidebar' : 'rail';
}

/** What the page just swapped in opens with. */
function chromeAfter(): Chrome {
  if (mq.mobile.matches || isStartPage()) return 'none';
  return mq.desktop.matches ? 'sidebar' : 'rail';
}

const setLayerName = (scroller: HTMLElement | null, on: boolean) => {
  if (scroller) scroller.style.viewTransitionName = on ? (scroller.dataset.vtName ?? '') : '';
};

// Before anything changes for the new page (the swap handlers already switch the sidebar).
document.addEventListener('astro:before-preparation', () => {
  // The old page's layer is captured when the transition starts, after this.
  setLayerName(getScroller(), true);
  from = order().indexOf(getScroller()?.dataset.page);
  chromeBefore = chromeNow();
});

// The new page's layer: named before it is captured, cleared once the transition is over.
document.addEventListener('astro:before-swap', (e) => {
  const next = e.newDocument.getElementById('scroller');
  setLayerName(next, true);
  void e.viewTransition.finished.finally(() => setLayerName(getScroller(), false));
});

document.addEventListener('astro:after-swap', () => {
  const to = order().indexOf(getScroller()?.dataset.page);
  const dir = from < 0 || to < 0 ? 0 : Math.sign(to - from);
  const root = document.documentElement;
  root.style.setProperty('--page-shift', dir ? `calc(${dir} * var(--content-top))` : '0px');
  const chromeNext = chromeAfter();
  if (chromeNext !== chromeBefore) root.setAttribute('data-chrome-fade', `${chromeBefore}-${chromeNext}`);
  else root.removeAttribute('data-chrome-fade');
});
