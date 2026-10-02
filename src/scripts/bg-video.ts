/**
 * Background video (HANDOFF §2.1): load only the clip that matches the layout —
 * landscape ≥1024px, portrait below — and never load it with reduced motion.
 * The <video> is persisted across navigation, so this runs once.
 */
const DESKTOP = { src: '/assets/video/lightning-desktop.mp4', poster: '/assets/video/lightning-desktop-poster.jpg' };
const MOBILE = { src: '/assets/video/lightning-mobile.mp4', poster: '/assets/video/lightning-mobile-poster.jpg' };

function init() {
  const v = document.getElementById('bgVideo') as HTMLVideoElement | null;
  if (!v || v.dataset.init) return;
  v.dataset.init = '1';
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; // never load

  const mq = matchMedia('(min-width: 1024px)');
  const pick = () => {
    const clip = mq.matches ? DESKTOP : MOBILE;
    v.poster = clip.poster;
    if (v.getAttribute('src') !== clip.src) {
      v.src = clip.src;
      v.play().catch(() => {});
    }
  };
  pick();
  mq.addEventListener('change', pick);
}

document.addEventListener('astro:page-load', init);
