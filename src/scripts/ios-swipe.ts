/**
 * Touch swipes on the sideways tracks (Games / explore / Community rows, the Start hero) on
 * iPhone / iPad only — all iOS browsers are WebKit, whose own sideways scrolling there
 * (momentum, snapping, rubber-band) fought every attempt to steer it: jitter, jumps,
 * stopping between items, bouncing past the end, flying past several items.
 *
 * So on iOS the browser doesn't scroll the tracks sideways at all (html[data-ios-touch]:
 * touch-action pan-y — vertical drags still scroll the page natively —, no sideways
 * overflow, no snapping; GameRow.astro, StartHero.astro) and this does it, by setting the
 * scroll position (still possible without overflow):
 *   - a mostly sideways drag (decided by its first DECIDE_PX) moves the track with the
 *     finger, 1:1, but only between the item before and the item after the one it counts
 *     from — one swipe never crosses more than one item, and never past either end (no
 *     rubber-band);
 *   - let go, the owner glides to the next / previous item or back (dom.ts swipeDirection:
 *     a fast swipe needs a little, a slow drag past half an item; the glide leaves at the
 *     finger's speed, dom.ts releaseEase) and lands on it exactly.
 * Everything else (Android, desktop, wheel, keys) is left to game-rows.ts / hero-slider.ts,
 * which step aside for touches here (IOS_TOUCH).
 */
import { releaseSpeed, setRootState, swipeDirection } from './dom';

/** iPhone / iPad (iPadOS reports itself as a Mac, but with touch) — WebKit only (no
    navigator.userAgentData): never Chromium, so Android / desktop Chrome can't match. */
export const IOS_TOUCH =
  !('userAgentData' in navigator) &&
  (/iP(hone|ad|od)/.test(navigator.platform) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
// For the CSS (see top).
setRootState('iosTouch', IOS_TOUCH ? '' : null);

const DECIDE_PX = 6;

export interface IosSwipeOwner {
  /** A finger came down on `track`: stop whatever moves it; return the item it counts from
      and the scroll positions of the items before / after it (the drag's limits), or null to
      leave the touch alone. */
  start(track: HTMLElement): { base: number; min: number; max: number; step: number } | null;
  /** Let go after a sideways drag: glide to item base + dir (dir 1 / -1 / 0) at speed v0. */
  release(track: HTMLElement, base: number, dir: number, v0: number): void;
  /** The drag turned out vertical (or was a tap): nothing moved — restore what start paused. */
  cancel(track: HTMLElement, base: number): void;
}

export function bindIosSwipe(selector: string, owner: IosSwipeOwner) {
  if (!IOS_TOUCH) return;
  let drag: {
    track: HTMLElement;
    id: number;
    x0: number;
    y0: number;
    left0: number;
    base: number;
    min: number;
    max: number;
    step: number;
    axis: 'x' | 'y' | null;
  } | null = null;

  document.addEventListener(
    'touchstart',
    (e) => {
      if (drag || e.touches.length !== 1) return;
      const track = (e.target as Element | null)?.closest<HTMLElement>(selector);
      if (!track) return;
      const s = owner.start(track);
      if (!s) return;
      const f = e.touches[0];
      const left0 = track.scrollLeft;
      // The limits always take in where it is (mid-glide it can lie outside them): it never
      // jumps on the first move.
      drag = {
        track,
        id: f.identifier,
        x0: f.clientX,
        y0: f.clientY,
        left0,
        ...s,
        min: Math.min(s.min, left0),
        max: Math.max(s.max, left0),
        axis: null,
      };
    },
    { capture: true, passive: true },
  );

  document.addEventListener(
    'touchmove',
    (e) => {
      if (!drag) return;
      const f = Array.from(e.touches).find((t) => t.identifier === drag!.id);
      if (!f) return;
      const dx = f.clientX - drag.x0;
      const dy = f.clientY - drag.y0;
      if (!drag.axis) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < DECIDE_PX) return;
        drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }
      if (drag.axis !== 'x') return; // the page scrolls (natively)
      drag.track.scrollLeft = Math.max(drag.min, Math.min(drag.max, drag.left0 - dx));
    },
    { capture: true, passive: true },
  );

  const end = (e: TouchEvent) => {
    if (!drag || Array.from(e.touches).some((t) => t.identifier === drag!.id)) return;
    const d = drag;
    drag = null;
    if (d.axis !== 'x') {
      owner.cancel(d.track, d.base);
      return;
    }
    const f = Array.from(e.changedTouches).find((t) => t.identifier === d.id);
    const moved = d.track.scrollLeft - d.left0;
    // The owner keeps it within its items (the rows clamp at their ends).
    owner.release(d.track, d.base, swipeDirection(f, moved, d.step), releaseSpeed());
  };
  document.addEventListener('touchend', end, { capture: true, passive: true });
  document.addEventListener('touchcancel', end, { capture: true, passive: true });
}
