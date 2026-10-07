import { animate, stagger } from 'https://cdn.jsdelivr.net/npm/motion@12.42.2/+esm';
const drawer = document.getElementById('about');
if (drawer) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const inside = drawer.querySelector('.about-drawer__inside');
  const avatar = drawer.querySelector('.about-avatar');
  const copy = drawer.querySelector('.about-drawer__copy');
  const lines = [...drawer.querySelectorAll('.about-drawer__line p')];
  const links = [...document.querySelectorAll('[data-about-link]')];
  let opened = false, opening = false;
  const height = () => Math.max(innerHeight, inside.scrollHeight);
  const bottom = () => document.documentElement.scrollHeight - innerHeight;
  const ready = () => window.SiteScroll && !document.body.classList.contains('is-loading');
  async function open({ fromLink = false } = {}) {
    if (!ready() || opening || (opened && !fromLink)) return;
    opening = true;
    // Reach the section before starting its reveal, rather than animating offscreen.
    if (fromLink && drawer.getBoundingClientRect().top > innerHeight * .7) {
      const arrived = await window.SiteScroll.scrollTo(drawer, -innerHeight * .65, { duration: .7 });
      if (!arrived) { opening = false; return; }
    }
    opened = true;
    drawer.classList.add('is-open');
    window.dispatchEvent(new CustomEvent('about-drawer:open', { detail: { fromLink } }));
    if (reduced.matches) {
      drawer.style.height = `${height()}px`;
      await window.SiteScroll.scrollTo(bottom);
    } else {
      const expansion = animate(drawer, { height: [drawer.getBoundingClientRect().height, height()] }, { duration: 1.05, ease: [.22, 1, .36, 1] });
      const entrance = animate([
        [avatar, { scale: [.72, 1], opacity: [.5, 1] }, { at: .12, type: 'spring', duration: .85, bounce: .15 }],
        [copy, { y: [20, 0], opacity: [0, 1] }, { at: .38, duration: .55, ease: [.22, 1, .36, 1] }],
        [lines, { x: ['-100%', '0%'], opacity: [0, 1] }, { at: .56, delay: stagger(.13), duration: .6, ease: [.22, 1, .36, 1] }],
      ]);
      await Promise.all([expansion, entrance, window.SiteScroll.scrollTo(bottom, 0, { duration: 1.2 })]);
    }
    drawer.style.height = `${height()}px`;
    opening = false;
    if (fromLink) window.dispatchEvent(new CustomEvent('about-drawer:arrived'));
    syncNav();
  }
  links.forEach(link => link.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const url = new URL(location.href); url.hash = 'about';
    if (location.hash !== '#about') history.pushState(null, '', url);
    open({ fromLink: true });
  }));
  function syncNav() {
    const top = drawer.getBoundingClientRect().top;
    const active = opened && top < innerHeight * .45;
    links.forEach(link => active ? link.setAttribute('aria-current', 'page') : link.removeAttribute('aria-current'));
    const collection = new URLSearchParams(location.search).get('collection');
    document.querySelectorAll('[data-collection-nav]').forEach(link => {
      if (!active && link.dataset.collectionNav === collection) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    if (!ready() || opening) return;
    // Re-arm only after the entire section is below the viewport, avoiding
    // layout jumps or repeated snapping while someone reads the About section.
    if (opened && top > innerHeight + 80) {
      opened = false;
      drawer.classList.remove('is-open');
      drawer.style.height = '';
      [avatar, copy, ...lines].forEach(element => {
        element.style.removeProperty('transform');
        element.style.removeProperty('opacity');
      });
    }
    if (!opened && top < innerHeight * .88) open();
  }
  window.addEventListener('scroll', syncNav, { passive: true });
  window.addEventListener('resize', () => {
    if (opened && !opening) drawer.style.height = `${height()}px`;
    syncNav();
  });
  const enterHash = () => { if (location.hash === '#about') open({ fromLink: true }); else syncNav(); };
  window.addEventListener('page-loader:hidden', enterHash);
  window.addEventListener('site-scroll:ready', enterHash);
  window.addEventListener('hashchange', enterHash);
  window.addEventListener('popstate', () => { if (location.hash === '#about') enterHash(); else window.SiteScroll?.scrollTo(0); });
  if (document.readyState === 'complete') enterHash();
  else window.addEventListener('load', enterHash, { once: true });
  window.AboutDrawer = { open, leave() { if (drawer.getBoundingClientRect().top < innerHeight) window.SiteScroll?.scrollTo(0); } };
}
