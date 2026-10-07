import { animate } from 'https://cdn.jsdelivr.net/npm/motion@12.42.2/+esm';

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let navigation;
let settleNavigation;
const locked = () => ['is-loading', 'is-nav-open', 'is-lightbox-open'].some(name => document.body.classList.contains(name));
const limit = () => Math.max(0, document.documentElement.scrollHeight - innerHeight);
const clamp = y => Math.max(0, Math.min(limit(), y));
const notify = () => window.dispatchEvent(new Event('site-scroll:update'));
function write(y) {
  window.scrollTo({ top: clamp(y), behavior: 'instant' });
  notify();
}
function stop() {
  navigation?.stop();
  navigation = null;
  settleNavigation?.(false); settleNavigation = null;
}
function resolveTarget(target, offset) {
  const top = typeof target === 'function' ? target() : typeof target === 'number' ? target : target.getBoundingClientRect().top + window.scrollY;
  return clamp(top + offset);
}
window.SiteScroll = {
  scrollTo(target, offset = 0, { duration = .85 } = {}) {
    stop();
    if (reduced.matches) { write(resolveTarget(target, offset)); return Promise.resolve(true); }
    const start = window.scrollY;
    return new Promise(resolve => {
      settleNavigation = resolve;
      navigation = animate(0, 1, {
        duration, ease: [.22, 1, .36, 1],
        onUpdate: progress => write(start + (resolveTarget(target, offset) - start) * progress),
        onComplete: () => {
          navigation = null; settleNavigation = null;
          resolve(true);
        },
      });
    });
  },
  stop,
  refresh: notify,
};

// Wheel and trackpad movement stay native. User input only cancels an active
// link-navigation animation; this listener never blocks browser scrolling.
window.addEventListener('wheel', stop, { passive: true });
window.addEventListener('scroll', notify, { passive: true });
window.addEventListener('touchstart', stop, { passive: true });
window.addEventListener('pointerdown', stop, { passive: true });
window.addEventListener('keydown', event => { if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) stop(); });
new MutationObserver(() => { if (locked()) stop(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
window.addEventListener('page-loader:hidden', () => window.SiteScroll.refresh());
reduced.addEventListener('change', stop);
// Anchor navigation outside project pages (which already have their own handler).
if (!document.querySelector('.main-projectpg')) document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if (!link || link.matches('[data-about-link]') || event.defaultPrevented) return;
  const target = document.getElementById(link.hash.slice(1));
  if (target) { event.preventDefault(); window.SiteScroll.scrollTo(target); }
});
window.dispatchEvent(new Event('site-scroll:ready'));
