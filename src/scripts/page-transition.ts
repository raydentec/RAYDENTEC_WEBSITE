/**
 * Page changes (global.css, "Changing pages"), set on <html> after the swap — the swap
 * replaces <html>'s attributes, and the transition's animations start after that:
 *
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

// Before anything changes for the new page (the swap handlers already switch the sidebar).
document.addEventListener('astro:before-preparation', () => {
  from = order().indexOf(getScroller()?.dataset.page);
  chromeBefore = chromeNow();
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
