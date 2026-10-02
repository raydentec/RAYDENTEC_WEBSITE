/**
 * Sidebar behaviour.
 *
 * Desktop (≥1280, HANDOFF §4) — <html data-sidebar="expanded|collapsed">:
 *   - auto-collapse once the active (snapped) container switches away from the first one;
 *     auto-expand only at scrollTop 0;
 *   - EXPAND while a later container is active pins it open until the active container
 *     changes again or the user clicks ←.
 * Tablet (768–1279, HANDOFF §8) — <html data-overlay="open">:
 *   - EXPAND opens the panel over the content with a dimmer;
 *   - closes on ←, dimmer click, Esc, or any content scroll; focus moves in/out.
 */
import {
  ACTIVE_CHANGE,
  activeIndex,
  getRootState,
  mq,
  onPageLoad,
  onScrollerScroll,
  setRootState,
  type ActiveChangeEvent,
} from './dom';

/** Active container index when the user expanded manually (null = not pinned). */
let pinnedAt: number | null = null;

const sidebar = () => document.getElementById('sidebar');

/* ---------- Slim scroll indicator, shown only when the sidebar can scroll ---------- */

function updateSidebarTrack() {
  const box = sidebar();
  const track = document.querySelector<HTMLElement>('[data-sidebar-track]');
  const thumb = document.querySelector<HTMLElement>('[data-sidebar-thumb]');
  if (!box || !track || !thumb) return;
  const { scrollTop, scrollHeight, clientHeight } = box;
  const scrollable = scrollHeight > clientHeight + 1;
  track.toggleAttribute('data-active', scrollable);
  if (!scrollable) return;
  // Only the scroll fraction comes from here; the handle's size and travel are CSS
  // relative to the track (Sidebar.astro), so it can never leave the track — even if
  // the layout changes without a scroll/resize event to update this.
  const frac = Math.min(1, Math.max(0, scrollTop / (scrollHeight - clientHeight)));
  thumb.style.setProperty('--frac', String(frac));
}

// The sidebar is persisted across navigation, so these bind once.
sidebar()?.addEventListener('scroll', updateSidebarTrack, { passive: true });
window.addEventListener('resize', updateSidebarTrack);
if (sidebar()) new ResizeObserver(updateSidebarTrack).observe(sidebar()!);
void document.fonts?.ready.then(updateSidebarTrack); // content height settles once fonts load
const expandBtn = () => document.querySelector<HTMLButtonElement>('[data-sidebar-expand]');
const collapseBtn = () => document.querySelector<HTMLButtonElement>('[data-sidebar-collapse]');
const isTablet = () => !mq.desktop.matches && !mq.mobile.matches;

function setExpanded(expanded: boolean) {
  if (mq.desktop.matches) {
    if (expanded) collapseExpandButton();
    else if (firstActive) openExpandButtonInstantly(); // fully open at once on close, no countdown
  }
  setRootState('sidebar', expanded ? 'expanded' : 'collapsed');
  if (mq.desktop.matches) expandBtn()?.setAttribute('aria-expanded', String(expanded));
}

function openOverlay() {
  collapseExpandButton();
  setRootState('overlay', 'open');
  expandBtn()?.setAttribute('aria-expanded', 'true');
  // The panel becomes visible synchronously (visibility switches with no delay).
  collapseBtn()?.focus({ preventScroll: true });
}

function closeOverlay(returnFocus = true) {
  if (getRootState('overlay') !== 'open') return;
  const hadFocus = sidebar()?.contains(document.activeElement) ?? false;
  setRootState('overlay', null);
  expandBtn()?.setAttribute('aria-expanded', 'false');
  if (firstActive) openExpandButtonInstantly(); // fully open at once on close, no countdown
  if (returnFocus || hadFocus) expandBtn()?.focus({ preventScroll: true });
}

/* ---------- EXPAND button: full height on hover/focus, collapses after leaving ---------- */

const EXPAND_COLLAPSE_DELAY_MS = 2000;
let expandCollapseTimer = 0;
/** Container 1 is selected: an expanded EXPAND button stays expanded (no countdown). */
let firstActive = true;

function openExpandButton() {
  window.clearTimeout(expandCollapseTimer);
  setRootState('expandOpen', '');
}

/** Sidebar closed on container 1: EXPAND is fully open at once, without the grow animation. */
function openExpandButtonInstantly() {
  setRootState('expandInstant', '');
  openExpandButton();
  void expandBtn()?.offsetHeight; // apply the open state before animations come back
  requestAnimationFrame(() => setRootState('expandInstant', null));
}

/** The sidebar has opened: start EXPAND's collapse animation now instead of after the delay. */
function collapseExpandButton() {
  window.clearTimeout(expandCollapseTimer);
  setRootState('expandOpen', null);
}

function closeExpandButtonSoon(delay = EXPAND_COLLAPSE_DELAY_MS) {
  window.clearTimeout(expandCollapseTimer);
  if (firstActive) return;
  expandCollapseTimer = window.setTimeout(() => {
    if (!firstActive) setRootState('expandOpen', null);
  }, delay);
}

// pointerover/out bubble (enter/leave don't), so these delegate from document once.
document.addEventListener('pointerover', (e) => {
  if ((e.target as Element | null)?.closest('[data-sidebar-expand]')) openExpandButton();
});
document.addEventListener('pointerout', (e) => {
  const btn = (e.target as Element | null)?.closest('[data-sidebar-expand]');
  if (btn && !btn.contains(e.relatedTarget as Node | null) && !btn.matches(':focus-visible')) closeExpandButtonSoon();
});
// Keyboard focus only: focus moved here by script after a mouse click (←) doesn't count.
document.addEventListener('focusin', (e) => {
  const btn = (e.target as Element | null)?.closest('[data-sidebar-expand]');
  if (btn?.matches(':focus-visible')) openExpandButton();
});
document.addEventListener('focusout', (e) => {
  const btn = (e.target as Element | null)?.closest('[data-sidebar-expand]');
  if (btn && !btn.matches(':hover')) closeExpandButtonSoon();
});

/* ---------- Bound once (persisted elements / document) ---------- */

document.addEventListener('click', (e) => {
  const target = e.target as Element | null;
  if (target?.closest('[data-sidebar-expand]')) {
    if (mq.desktop.matches) {
      const index = activeIndex();
      pinnedAt = index > 0 ? index : null;
      setExpanded(true);
      collapseBtn()?.focus({ preventScroll: true });
    } else {
      openOverlay();
    }
  } else if (target?.closest('[data-sidebar-collapse]')) {
    if (mq.desktop.matches) {
      pinnedAt = null;
      setExpanded(false);
      expandBtn()?.focus({ preventScroll: true });
    } else {
      closeOverlay();
    }
  } else if (target?.closest('[data-sidebar-dimmer]')) {
    closeOverlay();
  }
});

document.addEventListener('keydown', (e) => {
  if (getRootState('overlay') !== 'open' || !isTablet()) return;
  if (e.key === 'Escape') {
    closeOverlay();
    return;
  }
  // Keep Tab inside the open panel.
  const panel = sidebar();
  if (e.key !== 'Tab' || !panel) return;
  const focusables = Array.from(panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (!first || !last) return;
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  } else if (!panel.contains(document.activeElement)) {
    e.preventDefault();
    first.focus();
  }
});

onScrollerScroll((scroller) => {
  if (isTablet()) {
    closeOverlay(false);
    return;
  }
  if (mq.desktop.matches && scroller.scrollTop <= 0) {
    pinnedAt = null;
    if (getRootState('sidebar') === 'collapsed') setExpanded(true);
  }
});

// Collapse once the snapped container is no longer the first one (snap.ts settles it).
document.addEventListener(ACTIVE_CHANGE, (e) => {
  const { index } = (e as ActiveChangeEvent).detail;
  const wasFirst = firstActive;
  firstActive = index === 0;
  if (firstActive) {
    // Container 1 selected: cancel any running countdown, so an expanded EXPAND stays so.
    window.clearTimeout(expandCollapseTimer);
    // Tablet: selecting container 1 also expands it (animated) if it isn't already.
    if (isTablet() && !wasFirst && getRootState('expandOpen') === null) openExpandButton();
  }
  // Leaving container 1 with EXPAND expanded: the normal countdown starts now.
  if (wasFirst && !firstActive && getRootState('expandOpen') !== null && !expandBtn()?.matches(':hover, :focus-visible')) {
    closeExpandButtonSoon();
  }
  if (!mq.desktop.matches || index <= 0 || getRootState('sidebar') === 'collapsed') return;
  if (pinnedAt !== null && index === pinnedAt) return;
  pinnedAt = null;
  setExpanded(false);
});

// Crossing breakpoints: drop the overlay, re-derive the desktop state.
const onBreakpoint = () => {
  closeOverlay(false);
  pinnedAt = null;
  setExpanded(activeIndex() <= 0);
  if (!mq.desktop.matches) expandBtn()?.setAttribute('aria-expanded', 'false');
  // Entering tablet size: EXPAND starts as it would on page load — expanded while
  // container 1 is selected (no countdown), collapsed otherwise.
  if (isTablet()) {
    firstActive = activeIndex() <= 0;
    if (firstActive) openExpandButton();
    else collapseExpandButton();
  }
};
mq.desktop.addEventListener('change', onBreakpoint);
mq.mobile.addEventListener('change', onBreakpoint);

/* ---------- Every navigation: the new column starts at scrollTop 0 ---------- */

onPageLoad(() => {
  updateSidebarTrack();
  firstActive = activeIndex() <= 0;
  closeOverlay(false);
  pinnedAt = null;
  setExpanded(true);
  if (!mq.desktop.matches) expandBtn()?.setAttribute('aria-expanded', 'false');
  // Container 1 selected on load: expand EXPAND (animated) — unless the desktop sidebar
  // is open, which keeps it collapsed (the rail is hidden then anyway).
  const sidebarOpen = mq.desktop.matches && getRootState('sidebar') !== 'collapsed';
  if (firstActive && !sidebarOpen) openExpandButton();
});
