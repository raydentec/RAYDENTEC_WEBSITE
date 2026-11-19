/**
 * Start page (StartHero.astro + StartExplore.astro). The scroll position decides which
 * half of the page is in view — <html data-hero-active> until the page has scrolled half of
 * the hero's visible part away, counted from where its bottom edge shows (where the hero
 * fits the screen — desktop / tablet — that's when half of it is out of view; a taller
 * mobile hero, StartHero.astro, is scrolled around first, so the switch only comes on the
 * way to the explore row):
 *   - desktop/tablet: no rail or sidebar (Rail.astro; the sidebar stays collapsed, sidebar.ts);
 *   - mobile: no fixed header (<html data-mheader>, set here instead of mobile-menu.ts);
 *   - the background video is hidden, and fades in once the hero scrolls out (global.css).
 * Scrolling back reverses it all; leaving the page drops it before the swap.

 *
 * The whole hero (image and lower third) fades out on the way to the explore row and
 * back in on the way up (--hero-art, StartHero.astro) — from where its bottom edge shows
 * (a hero taller than a short phone's screen scrolls around first). Once it is gone, content above the
 * header line (behind the nav / mobile header) is cut off as on other pages — the explore
 * row when it is taller than the window and scrolled on (--top-a, the scroller's mask in
 * Shell.astro: 1 shows that band, 0 hides it).
 */
import {
  getScroller,
  isStartPage,
  mq,
  onPageLoad,
  onScrollerScroll,
  setRootState,
  snapOffset,
  snapSpans,
  snapTop,
} from './dom';

/** Hero lower third's height → --lt-h on the hero (its mobile image fade, StartHero.astro). */
let ltObserver: ResizeObserver | null = null;
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
  // From where the hero's bottom edge shows: a hero taller than the screen (mobile minimum
  // height, StartHero.astro) can be scrolled around first without fading.
  const start = Math.min(end, snapSpans(scroller)[0]?.end ?? 0);
  const p = end > start ? Math.min(1, Math.max(0, (scroller.scrollTop - start) / (end - start))) : 1;
  // Hero in view: until half of what shows of it at `start` has scrolled away (see top).
  const hero = scroller.querySelector<HTMLElement>('[data-hero]');
  if (hero) {
    const shownAtStart = hero.getBoundingClientRect().bottom - scroller.getBoundingClientRect().top + scroller.scrollTop - start;
    const active = scroller.scrollTop < start + shownAtStart / 2;
    if (active !== heroActive) apply(active);
  }
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
  ltObserver?.disconnect();
  ltObserver = null;
  const toStart = isStartPage(e.newDocument);
  heroActive = toStart;
  setRootState('heroActive', toStart ? '' : null);
  if (toStart) setRootState('mheader', null);
});

onPageLoad(() => {
  ltObserver?.disconnect();
  ltObserver = null;
  const scroller = getScroller();
  const hero = scroller?.querySelector<HTMLElement>('[data-hero]');
  if (!scroller || !hero) {
    heroActive = false;
    setRootState('heroActive', null); // the header is mobile-menu.ts's again
    return;
  }
  apply(true);
  updateFade(scroller);
  const lt = hero.querySelector<HTMLElement>('.lt');
  if (lt) {
    ltObserver = new ResizeObserver(() => {
      hero.style.setProperty('--lt-h', `${lt.offsetHeight}px`);
      updateFade(scroller); // the hero's height can follow (mobile minimum, StartHero.astro)
    });
    ltObserver.observe(lt);
  }
});
