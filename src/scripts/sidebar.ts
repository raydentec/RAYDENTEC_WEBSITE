/**
 * Sidebar behaviour.
 *
 * Desktop (≥1280, HANDOFF §4) — <html data-sidebar="expanded|collapsed">:
 *   - auto-collapse when the content scrollTop > 80, auto-expand only at scrollTop 0;
 *   - EXPAND while scrolled pins it open until the user scrolls another 80px or clicks ←.
 * Tablet (768–1279, HANDOFF §8) — <html data-overlay="open">:
 *   - EXPAND opens the panel over the content with a dimmer;
 *   - closes on ←, dimmer click, Esc, or any content scroll; focus moves in/out.
 */
import { getRootState, getScroller, mq, onPageLoad, onScrollerScroll, setRootState } from './dom';

const COLLAPSE_AFTER = 80;
/** scrollTop at which the user expanded manually (null = not pinned). */
let pinnedAt: number | null = null;

const sidebar = () => document.getElementById('sidebar');
const expandBtn = () => document.querySelector<HTMLButtonElement>('[data-sidebar-expand]');
const collapseBtn = () => document.querySelector<HTMLButtonElement>('[data-sidebar-collapse]');
const isTablet = () => !mq.desktop.matches && !mq.mobile.matches;

function setExpanded(expanded: boolean) {
  setRootState('sidebar', expanded ? 'expanded' : 'collapsed');
  if (mq.desktop.matches) expandBtn()?.setAttribute('aria-expanded', String(expanded));
}

function openOverlay() {
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
  if (returnFocus || hadFocus) expandBtn()?.focus({ preventScroll: true });
}

/* ---------- Bound once (persisted elements / document) ---------- */

document.addEventListener('click', (e) => {
  const target = e.target as Element | null;
  if (target?.closest('[data-sidebar-expand]')) {
    if (mq.desktop.matches) {
      const st = getScroller()?.scrollTop ?? 0;
      pinnedAt = st > 0 ? st : null;
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
  if (!mq.desktop.matches) return;
  const st = scroller.scrollTop;
  const expanded = getRootState('sidebar') !== 'collapsed';
  if (st <= 0) {
    pinnedAt = null;
    if (!expanded) setExpanded(true);
  } else if (expanded) {
    const moved = pinnedAt === null ? st : Math.abs(st - pinnedAt);
    if (moved > COLLAPSE_AFTER) {
      pinnedAt = null;
      setExpanded(false);
    }
  }
});

// Crossing breakpoints: drop the overlay, re-derive the desktop state.
const onBreakpoint = () => {
  closeOverlay(false);
  pinnedAt = null;
  setExpanded((getScroller()?.scrollTop ?? 0) <= COLLAPSE_AFTER);
  if (!mq.desktop.matches) expandBtn()?.setAttribute('aria-expanded', 'false');
};
mq.desktop.addEventListener('change', onBreakpoint);
mq.mobile.addEventListener('change', onBreakpoint);

/* ---------- Every navigation: the new column starts at scrollTop 0 ---------- */

onPageLoad(() => {
  closeOverlay(false);
  pinnedAt = null;
  setExpanded(true);
  if (!mq.desktop.matches) expandBtn()?.setAttribute('aria-expanded', 'false');
});
