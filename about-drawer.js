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
  // Same moment About's entrance starts: slide the Archive tab in and let it expand.
  const archiveSeen = () => {
    try { return sessionStorage.getItem('ncwei:about-visited') === '1'; } catch { return false; }
  };
  let archiveRevealed = archiveSeen();
  function revealArchiveNav() {
    if (archiveRevealed || archiveSeen()) { archiveRevealed = true; return; }
    if (document.fonts && document.fonts.status !== 'loaded') {
      document.fonts.ready.then(revealArchiveNav);
      return;
    }
    archiveRevealed = true;
    try { sessionStorage.setItem('ncwei:about-visited', '1'); } catch {}
    const items = [...document.querySelectorAll('header nav li, .sidebar li')]
      .filter(li => li.querySelector(':scope > a[href="archive.html"]'))
      .filter(li => getComputedStyle(li.parentElement).display !== 'none');
    const finish = () => {
      items.forEach(li => {
        li.style.cssText = '';
        li.querySelector('a')?.style.removeProperty('transform');
      });
      document.documentElement.classList.remove('archive-locked', 'archive-unlocking');
    };
    if (reduced.matches || !items.length) { finish(); return; }
    const specs = items.map(li => {
      const sidebar = Boolean(li.closest('.sidebar'));
      li.style.cssText = 'position:absolute;visibility:hidden;width:max-content;height:auto;max-width:none;min-width:0;flex:none;margin:0;overflow:visible;';
      const size = sidebar ? li.offsetHeight : li.offsetWidth;
      li.style.cssText = '';
      return { li, sidebar, size, link: li.querySelector('a') };
    }).filter(spec => spec.size > 0);
    if (!specs.length) { finish(); return; }
    document.documentElement.classList.add('archive-unlocking');
    const gap = parseFloat(getComputedStyle(specs[0].li.parentElement).columnGap) || 0;
    const neg = -gap / 2;
    const ease = [.22, 1, .36, 1];
    const motions = [];
    specs.forEach(({ li, sidebar, size, link }) => {
      li.style.overflow = 'hidden';
      li.style.visibility = 'visible';
      li.style.pointerEvents = 'none';
      li.style.flex = '0 0 auto';
      li.style.minWidth = '0';
      if (sidebar) {
        li.style.height = '0px';
        motions.push(animate(li, { height: [0, size] }, { duration: .75, ease }));
        if (link) motions.push(animate(link, { y: ['110%', '0%'] }, { duration: .65, delay: .08, ease }));
      } else {
        li.style.width = '0px';
        li.style.marginLeft = `${neg}px`;
        li.style.marginRight = `${neg}px`;
        motions.push(animate(li, { width: [0, size], marginLeft: [neg, 0], marginRight: [neg, 0] }, { duration: .75, ease }));
        if (link) motions.push(animate(link, { x: ['-100%', '0%'] }, { duration: .65, delay: .06, ease }));
      }
    });
    Promise.all(motions).then(finish, finish);
  }
  window.addEventListener('about-drawer:open', revealArchiveNav);
  window.addEventListener('page-loader:hidden', enterHash);
  window.addEventListener('site-scroll:ready', enterHash);
  window.addEventListener('hashchange', enterHash);
  window.addEventListener('popstate', () => { if (location.hash === '#about') enterHash(); else window.SiteScroll?.scrollTo(0); });
  if (document.readyState === 'complete') enterHash();
  else window.addEventListener('load', enterHash, { once: true });
  window.AboutDrawer = { open, leave() { if (drawer.getBoundingClientRect().top < innerHeight) window.SiteScroll?.scrollTo(0); } };
}
