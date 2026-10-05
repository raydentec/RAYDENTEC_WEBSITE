/**
 * Projects category filter (pages/projects.astro). Category buttons toggle on and off
 * and can be combined; the groups of the selected categories are shown. All clears the
 * selection and shows every group (also when the last category is switched off).
 *
 * Every change reloads the list: the shown headlines and containers fade out (as the
 * column does when leaving a page), then the new selection is shown from the start —
 * renumbered 1…n, first container selected — and fades in one after another by its
 * position in the filtered list, as when the page opens.
 *
 * The selection is remembered for the tab (sessionStorage): coming back to Projects —
 * from another page or on reload — opens with it already applied (set on the incoming
 * page before it is swapped in, so it doesn't flash the full list).
 */
import type { TransitionBeforeSwapEvent } from 'astro:transitions/client';
import { getScroller, mq, snapOffset, snapTop } from './dom';
import { refreshColumn } from './snap';

const STORE_KEY = 'raydentec:project-filter';
/** Fallback when sessionStorage is unavailable: kept while the tab stays on the site. */
let remembered: string[] = [];

function save(selected: Set<string>) {
  remembered = [...selected];
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(remembered));
  } catch {
    /* private mode / storage blocked: the in-memory copy still covers page switches */
  }
}

function load(): Set<string> {
  try {
    const stored = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? 'null');
    if (Array.isArray(stored)) return new Set(stored.filter((c): c is string => typeof c === 'string'));
  } catch {
    /* fall back to the in-memory copy */
  }
  return new Set(remembered);
}

/**
 * Show the groups of `selected` (all when empty) in `root`'s column — buttons, hidden
 * groups, numbers and fade-in order. Works on a page not yet swapped in (no layout).
 * Returns the shown containers.
 */
function show(root: ParentNode, selected: Set<string>) {
  root.querySelectorAll<HTMLElement>('[data-filter-btn]').forEach((b) => {
    const category = b.dataset.filterBtn ?? '';
    b.setAttribute('aria-pressed', String(category === 'All' ? selected.size === 0 : selected.has(category)));
  });
  root.querySelectorAll<HTMLElement>('[data-category]').forEach((group) => {
    group.hidden = selected.size > 0 && !selected.has(group.dataset.category ?? '');
  });
  // Renumber, and stagger the fade-in by position in the filtered list (a headline
  // comes in with its container).
  const shown = Array.from(root.querySelectorAll<HTMLElement>('[data-category]:not([hidden]) [data-cf]'));
  shown.forEach((cf, i) => {
    const num = cf.querySelector('.cf__num');
    if (num) num.textContent = String(i + 1);
    cf.style.setProperty('--cf-i', String(i));
    const head = cf.previousElementSibling;
    if (head instanceof HTMLElement && head.matches('.pgroup__title')) head.style.setProperty('--cf-i', String(i));
  });
  return shown;
}

/** Open Projects with the remembered selection: the first shown container is selected. */
function restore(scroller: HTMLElement) {
  const selected = load();
  if (!selected.size || !scroller.querySelector('[data-filter]')) return;
  const shown = show(scroller, selected);
  scroller.querySelectorAll('[data-cf]').forEach((cf) => cf.classList.toggle('is-active', cf === shown[0]));
}

/** Same as the content column's fade when leaving a page (Shell.astro). */
const FADE_OUT_MS = 160;
/** Running fade-out; clicks during it only change the buttons — it applies the latest. */
let fading = false;

/** Headlines and containers of the groups currently shown. */
const listItems = (scroller: HTMLElement) =>
  Array.from(scroller.querySelectorAll<HTMLElement>('[data-category]:not([hidden]) > *'));

function fadeOut(scroller: HTMLElement, then: () => void) {
  if (fading) return;
  if (mq.reducedMotion.matches) return then();
  fading = true;
  const fades = listItems(scroller).map((el) =>
    el.animate([{ opacity: getComputedStyle(el).opacity }, { opacity: 0 }], {
      duration: FADE_OUT_MS,
      easing: 'ease',
      fill: 'forwards',
    }),
  );
  Promise.all(fades.map((a) => a.finished)).then(() => {
    fading = false;
    then();
  });
}

function apply(scroller: HTMLElement, buttons: HTMLElement[]) {
  const selected = new Set(
    buttons
      .filter((b) => b.dataset.filterBtn !== 'All' && b.getAttribute('aria-pressed') === 'true')
      .map((b) => b.dataset.filterBtn ?? ''),
  );
  save(selected);
  const shown = show(scroller, selected);

  // Clear the selection (it may sit on a now hidden container) and go back to the start:
  // the first shown container — with the buttons and its headline — on the snap line.
  scroller.querySelectorAll('[data-cf].is-active').forEach((cf) => cf.classList.remove('is-active'));
  refreshColumn(scroller);
  if (shown[0]) {
    const line = scroller.getBoundingClientRect().top + snapOffset(scroller);
    scroller.scrollTop += snapTop(shown[0]) - line;
  }

  // Replay the page-open fade-in (CSS) and drop the fade-out holding them hidden.
  scroller.querySelectorAll<HTMLElement>('[data-category] > *').forEach((el) =>
    el.getAnimations().forEach((a) => {
      if (a instanceof CSSAnimation) {
        a.cancel();
        a.play();
      } else a.cancel();
    }),
  );
  // snap.ts selects the container at the snap line once scrolling settles.
  scroller.dispatchEvent(new Event('scroll'));
}

document.addEventListener('click', (e) => {
  const btn = (e.target as Element).closest<HTMLButtonElement>('[data-filter-btn]');
  const scroller = getScroller();
  const buttons = Array.from(btn?.parentElement?.querySelectorAll<HTMLElement>('[data-filter-btn]') ?? []);
  const all = buttons.find((b) => b.dataset.filterBtn === 'All');
  if (!btn || !scroller || !all) return;
  const pressed = (b: HTMLElement) => b.getAttribute('aria-pressed') === 'true';
  const press = (b: HTMLElement, on: boolean) => b.setAttribute('aria-pressed', String(on));

  if (btn === all) {
    if (pressed(all)) return;
    buttons.forEach((b) => press(b, b === all));
  } else {
    press(btn, !pressed(btn));
    press(all, !buttons.some((b) => b !== all && pressed(b)));
  }
  fadeOut(scroller, () => apply(scroller, buttons));
});

// Coming back to Projects: apply the selection to the incoming page before the swap,
// so snap.ts positions and selects within the filtered list.
document.addEventListener('astro:before-swap', (e) => {
  const scroller = (e as TransitionBeforeSwapEvent).newDocument.getElementById('scroller');
  if (scroller) restore(scroller);
});
// Full page load (first visit in the tab, reload).
const initial = getScroller();
if (initial) restore(initial);
