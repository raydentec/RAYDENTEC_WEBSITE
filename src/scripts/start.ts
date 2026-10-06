/**
 * Start page (StartHero.astro + StartExplore.astro). One observer on the hero decides
 * which half of the page is in view — <html data-hero-active> while at least half of the
 * hero shows:
 *   - desktop/tablet: no rail or sidebar (Rail.astro; the sidebar stays collapsed, sidebar.ts);
 *   - mobile: no fixed header (<html data-mheader>, set here instead of mobile-menu.ts);
 *   - the background video is hidden, and fades in once the hero scrolls out (global.css).
 * Scrolling back reverses it all; leaving the page drops it before the swap.
 *
 * The whole hero (image and lower third) fades out on the way to the explore row and
 * back in on the way up (--hero-art, StartHero.astro). Once it is gone, content above the
 * header line (behind the nav / mobile header) is cut off as on other pages — the explore
 * row when it is taller than the window and scrolled on (--top-a, the scroller's mask in
 * Shell.astro: 1 shows that band, 0 hides it).
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
  scroller.style.setProperty('--hero-art', String(1 - p));
  // 0.99: the snapped position can land a sub-pixel short of the end.
  scroller.style.setProperty('--top-a', p >= 0.99 ? '0' : '1');
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
