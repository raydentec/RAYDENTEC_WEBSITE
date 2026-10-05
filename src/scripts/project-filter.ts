/**
 * Projects category filter (pages/projects.astro). Category buttons toggle on and off
 * and can be combined; the groups of the selected categories are shown. All clears the
 * selection and shows every group (also when the last category is switched off). The
 * shown containers are renumbered 1…n and the column returns to its start with the first
 * shown container selected.
 */
import { containers, getScroller, snapOffset, snapTop } from './dom';
import { refreshColumn } from './snap';

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
    const any = buttons.some((b) => b !== all && pressed(b));
    press(all, !any);
  }
  const selected = new Set(buttons.filter((b) => b !== all && pressed(b)).map((b) => b.dataset.filterBtn));
  scroller.querySelectorAll<HTMLElement>('[data-category]').forEach((group) => {
    group.hidden = selected.size > 0 && !selected.has(group.dataset.category);
  });

  const shown = containers(scroller);
  shown.forEach((cf, i) => {
    const num = cf.querySelector('.cf__num');
    if (num) num.textContent = String(i + 1);
  });
  // Clear the selection (it may sit on a now hidden container) and go back to the start:
  // the first shown container — with the buttons and its headline — on the snap line.
  scroller.querySelectorAll('[data-cf].is-active').forEach((cf) => cf.classList.remove('is-active'));
  refreshColumn(scroller);
  if (shown[0]) {
    const line = scroller.getBoundingClientRect().top + snapOffset(scroller);
    scroller.scrollTop += snapTop(shown[0]) - line;
  }
  // snap.ts selects the container at the snap line once scrolling settles.
  scroller.dispatchEvent(new Event('scroll'));
});
