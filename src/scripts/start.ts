/**
 * Start page (StartHero.astro + StartExplore.astro). One observer on the hero decides
 * which half of the page is in view — <html data-hero-active> while at least half of the
 * hero shows:
 *   - desktop/tablet: no rail or sidebar (Rail.astro; the sidebar stays collapsed, sidebar.ts);
 *   - mobile: no fixed header (<html data-mheader>, set here instead of mobile-menu.ts);
 *   - the background video is hidden, and fades in once the hero scrolls out (global.css).
 * Scrolling back reverses it all; leaving the page drops it before the swap.
 *
 * Content scrolled above the header line (behind the nav / mobile header) fades out as
 * the page leaves the hero: --hero-a, the opacity the scroller's mask (Shell.astro) gives
 * that band — 1 at the top, 0 from halfway to the explore row on. The whole hero (image
 * and lower third) fades out over the whole way, and back in on the way up (--hero-art,
 * StartHero.astro).
 */
import { getScroller, isStartPage, mq, onPageLoad, onScrollerScroll, setRootState, snapOffset, snapTop } from './dom';

let observer: IntersectionObserver | null = null;
/** Hero in view (at least half of it). */
let heroActive = false;

function apply(active: boolean) {
  heroActive = active;
  setRootState('heroActive', active ? '' : null);
  setRootState('mheader', !active && mq.mobile.matches ? 'on' : null);
}

function updateFade(scroller: HTMLElement) {
  const explore = scroller.querySelector<HTMLElement>('[data-row]');
  if (!explore) return;
  // scrollTop at which the explore row rests on the snap line.
  const end = scroller.scrollTop + snapTop(explore) - scroller.getBoundingClientRect().top - snapOffset(scroller);
  const p = end > 0 ? Math.min(1, scroller.scrollTop / end) : 1;
  scroller.style.setProperty('--hero-a', String(Math.max(0, 1 - 2 * p)));
  scroller.style.setProperty('--hero-art', String(1 - p));
}

onScrollerScroll((scroller) => {
  if (isStartPage()) updateFade(scroller);
});

window.addEventListener('resize', () => {
  const scroller = getScroller();
  if (scroller && isStartPage()) updateFade(scroller);
});

mq.mobile.addEventListener('change', () => {
  if (isStartPage()) apply(heroActive);
});

// Leaving (or arriving at) Start: set the state for the new page before it is shown, so
// the rail / header / video don't flash. (dom.ts re-applies root state after the swap.)
document.addEventListener('astro:before-swap', (e) => {
  observer?.disconnect();
  observer = null;
  const toStart = isStartPage(e.newDocument);
  heroActive = toStart;
  setRootState('heroActive', toStart ? '' : null);
  if (toStart) setRootState('mheader', null);
});

onPageLoad(() => {
  observer?.disconnect();
  observer = null;
  const scroller = getScroller();
  const hero = scroller?.querySelector<HTMLElement>('[data-hero]');
  if (!scroller || !hero) {
    heroActive = false;
    setRootState('heroActive', null); // the header is mobile-menu.ts's again
    return;
  }
  apply(true);
  updateFade(scroller);
  observer = new IntersectionObserver(([entry]) => apply(entry.intersectionRatio >= 0.5), {
    root: scroller,
    threshold: 0.5,
  });
  observer.observe(hero);
});
