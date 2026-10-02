/**
 * Mobile (<768, HANDOFF §9):
 *   - bottom page menu — <html data-mmenu="open">; closes on select, ×, dimmer tap, Esc;
 *   - fixed header — <html data-mheader="on"> once the in-flow profile block's bottom
 *     passes the header line.
 * Also keeps aria-current in sync on the persisted top nav and menu after navigation.
 */
import { getRootState, getScroller, mq, onPageLoad, onScrollerScroll, setRootState, snapOffset } from './dom';

const toggle = () => document.querySelector<HTMLButtonElement>('[data-mmenu-toggle]');

function setMenu(open: boolean) {
  setRootState('mmenu', open ? 'open' : null);
  const btn = toggle();
  btn?.setAttribute('aria-expanded', String(open));
  btn?.setAttribute('aria-label', open ? 'Close page menu' : 'Open page menu');
}

function updateHeader(scroller: HTMLElement) {
  const profile = scroller.querySelector<HTMLElement>('[data-mprofile]');
  if (!mq.mobile.matches || !profile) {
    setRootState('mheader', null);
    return;
  }
  // The header line is where containers snap (scroll-padding-top). Measured from the
  // scroller rather than the header, which is offset while hidden. 2px absorbs
  // sub-pixel snapping, where the profile's bottom lands right on the line.
  const headerLine = scroller.getBoundingClientRect().top + snapOffset(scroller);
  setRootState('mheader', profile.getBoundingClientRect().bottom <= headerLine + 2 ? 'on' : null);
}

/** Persisted nav + menu don't re-render, so mark the current page here. */
function syncCurrentPage() {
  const page = getScroller()?.dataset.page;
  if (!page) return;
  document.querySelectorAll<HTMLAnchorElement>('.topnav__link, .mmenu__row').forEach((a) => {
    if (a.dataset.page === page) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const current = document.querySelector(`.mmenu__row[data-page="${page}"] span`);
  const label = document.querySelector('[data-mmenu-current]');
  if (current && label) label.textContent = current.textContent;
}

document.addEventListener('click', (e) => {
  const target = e.target as Element | null;
  if (target?.closest('[data-mmenu-toggle]')) setMenu(getRootState('mmenu') !== 'open');
  else if (target?.closest('[data-mmenu-dimmer]') || target?.closest('.mmenu__row')) setMenu(false);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && getRootState('mmenu') === 'open') {
    setMenu(false);
    toggle()?.focus();
  }
});

onScrollerScroll(updateHeader);
mq.mobile.addEventListener('change', () => {
  setMenu(false);
  const scroller = getScroller();
  if (scroller) updateHeader(scroller);
});

onPageLoad(() => {
  setMenu(false);
  syncCurrentPage();
  const scroller = getScroller();
  if (scroller) updateHeader(scroller);
});
