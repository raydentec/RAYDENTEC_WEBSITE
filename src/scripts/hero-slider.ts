/**
 * Start hero image slider (StartHero.astro). Every INTERVAL_MS the next image slides in
 * from the right while the current one slides out to the left (after the last comes the
 * first again). Clicking an indicator line shows that image — sliding in from the side
 * it lies on — and restarts the timer.
 *
 * The timer keeps running while the pointer is over the hero and while the explore row
 * is in view. It only skips while keyboard focus is in the hero (its indicator / links;
 * leaving restarts it) and while the tab is hidden. Reduced motion: no timer, and the
 * indicator switches images without the slide.
 */
import { getScroller, mq, onPageLoad } from './dom';

const INTERVAL_MS = 5000;
const SLIDE_MS = 700;
const EASE = 'cubic-bezier(.2, .8, .2, 1)';

let timer = 0;
let current = 0;
let held = false;

const slider = () => getScroller()?.querySelector<HTMLElement>('[data-slider]') ?? null;
const slides = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>('[data-slide]'));
const dots = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>('[data-slide-dot]'));

function show(root: HTMLElement, index: number, dir: 1 | -1) {
  const all = slides(root);
  if (index === current || !all[index]) return;
  const from = all[current];
  const to = all[index];
  // A slide still moving from the last switch: jump it to its end first.
  all.forEach((s) => s.getAnimations().forEach((a) => a.finish()));
  from.classList.remove('is-current');
  to.classList.add('is-current');
  dots(root).forEach((d, i) => (i === index ? d.setAttribute('aria-current', 'true') : d.removeAttribute('aria-current')));
  current = index;
  if (mq.reducedMotion.matches) return;
  from.classList.add('is-leaving');
  const options = { duration: SLIDE_MS, easing: EASE };
  to.animate([{ transform: `translateX(${dir * 100}%)` }, { transform: 'none' }], options);
  from
    .animate([{ transform: 'none' }, { transform: `translateX(${-dir * 100}%)` }], options)
    .finished.catch(() => {})
    .finally(() => from.classList.remove('is-leaving'));
}

function restart() {
  window.clearInterval(timer);
  if (mq.reducedMotion.matches) return;
  timer = window.setInterval(() => {
    const root = slider();
    if (!root || held || document.hidden) return;
    show(root, (current + 1) % slides(root).length, 1);
  }, INTERVAL_MS);
}

// Bound once on document: keyboard focus in the hero holds the timer (a line clicked with
// the mouse keeps focus but doesn't hold it).
document.addEventListener('focusin', (e) => {
  const target = e.target as Element | null;
  if (target?.closest('[data-slider]') && target.matches(':focus-visible')) held = true;
});
document.addEventListener('focusout', (e) => {
  const root = (e.target as Element | null)?.closest('[data-slider]');
  if (!root || root.contains(e.relatedTarget as Node | null)) return;
  held = false;
  restart();
});

document.addEventListener('click', (e) => {
  const dot = (e.target as Element | null)?.closest<HTMLElement>('[data-slide-dot]');
  const root = dot?.closest<HTMLElement>('[data-slider]');
  if (!dot || !root) return;
  const index = dots(root).indexOf(dot);
  show(root, index, index > current ? 1 : -1);
  restart();
});

document.addEventListener('astro:before-swap', () => window.clearInterval(timer));

onPageLoad(() => {
  window.clearInterval(timer);
  current = 0;
  held = false;
  if (slider()) restart();
});
