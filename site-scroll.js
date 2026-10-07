import { animate, motionValue } from 'https://cdn.jsdelivr.net/npm/motion@12.42.2/+esm';

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const coarse = matchMedia('(pointer: coarse)');
const position = motionValue(window.scrollY);
let wheelTarget = window.scrollY;
let expected = window.scrollY;
let wheelAnimation;
let navigation;
let settleNavigation;
const locked = () => ['is-loading', 'is-nav-open', 'is-lightbox-open'].some(name => document.body.classList.contains(name));
const limit = () => Math.max(0, document.documentElement.scrollHeight - innerHeight);
const clamp = y => Math.max(0, Math.min(limit(), y));
const notify = () => window.dispatchEvent(new Event('site-scroll:update'));
function write(y) {
  expected = clamp(y);
  window.scrollTo({ top: expected, behavior: 'instant' });
  notify();
}
position.on('change', write);
function stop() {
  wheelAnimation?.stop(); navigation?.stop();
  wheelAnimation = navigation = null;
  settleNavigation?.(false); settleNavigation = null;
  wheelTarget = expected = window.scrollY;
  position.jump(window.scrollY);
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
          wheelTarget = expected = window.scrollY; position.jump(window.scrollY);
          resolve(true);
        },
      });
    });
  },
  stop,
  refresh() { wheelTarget = clamp(wheelTarget); notify(); },
};

function nestedScroller(target, delta) {
  for (let el = target instanceof Element ? target : null; el && el !== document.body; el = el.parentElement) {
    if (el.matches('input, textarea, select, [contenteditable="true"]')) return true;
    if (/(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1 &&
      (delta > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0)) return true;
  }
  return false;
}
window.addEventListener('wheel', event => {
  if (reduced.matches || coarse.matches || locked() || event.ctrlKey || event.metaKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) || nestedScroller(event.target, event.deltaY)) return;
  const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
  if (!delta) return;
  event.preventDefault();
  if (navigation) stop();
  if (!wheelAnimation) { wheelTarget = window.scrollY; position.jump(window.scrollY); }
  wheelTarget = clamp(wheelTarget + delta);
  // Motion values preserve velocity as wheel/trackpad targets change.
  wheelAnimation = animate(position, wheelTarget, { type: 'spring', stiffness: 220, damping: 32, mass: .8 });
}, { passive: false });
window.addEventListener('scroll', () => {
  // Layout growth and initial hash alignment can emit native scroll events
  // during drawer navigation. Actual user input interrupts through the handlers below.
  if (!navigation && Math.abs(window.scrollY - expected) > 3) stop();
  notify();
}, { passive: true });
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
