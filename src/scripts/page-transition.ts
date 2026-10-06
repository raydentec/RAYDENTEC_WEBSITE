/**
 * Page change direction (global.css, "Changing pages"): --page-shift on <html>, by the
 * pages' order in the top menu — going right moves the pages down by the content top
 * (as far as the column's top edge moves between Start and Games), going left moves them
 * up, the same page doesn't slide. Set after the swap, since the swap replaces <html>'s
 * attributes; the transition's animations start after that.
 */
import { getScroller } from './dom';

let from = -1;
const order = () => Array.from(document.querySelectorAll<HTMLElement>('.topnav__link')).map((a) => a.dataset.page);

document.addEventListener('astro:before-swap', () => {
  from = order().indexOf(getScroller()?.dataset.page);
});

document.addEventListener('astro:after-swap', () => {
  const to = order().indexOf(getScroller()?.dataset.page);
  const dir = from < 0 || to < 0 ? 0 : Math.sign(to - from);
  document.documentElement.style.setProperty('--page-shift', dir ? `calc(${dir} * var(--content-top))` : '0px');
});
