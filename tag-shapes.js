import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

// Two superformula sections, following the supplied superformula_explorer.html.
// Each pair is [m, n1, n2, n3, a, b]: equator (set 1) then pole-to-pole (set 2).
// a and b default to 1 when a shape omits them.
const shapes = {
  'All Projects': { color: '#c5b5f7', a: [12, 4.1, 7.7, 9.9, .9, 1], b: [1, 3.1, 2.1, 2.1, 1, 1.05] },
  work: { color: '#83b8ff', a: [4, 9, 9, 9], b: [4, 9, 9, 9] },
  playground: { color: '#f797be', a: [12, 2.3, 1.8, .3], b: [10, 1, 7, 12] },
  '3D': { color: '#b497ff', a: [4, 1, 1, 1], b: [4, 1, 1, 1] },
  Book: { color: '#e6b675', a: [4, 16, 16, 16], b: [4, 16, 16, 16], scale: [1, 1.15, .42] },
  'Branding & Identity': { color: '#ff9475', a: [9, 7.3, .4, .4, 1, 1], b: [2, 2.3, 6.2, 14.7, 1, 1.1] },
  'Creative Coding': { color: '#9ddd83', a: [10, .6, 1.3, 1.4, 1.25, 1], b: [12, .2, 4.5, .5, .95, 1.1] },
  'Motion Graphics': { color: '#73d9d1', a: [6, 1, 7, 8, 1, 1], b: [4, 10, 10, 10, 1, 1] },
  Poster: { color: '#f0d573', a: [12, .5, 1.2, 1.2, 1, 1], b: [1, .3, 1, .3, 1, 1] },
  'UI / UX': { color: '#86cadf', a: [4, 4, 4, 4], b: [4, 4, 4, 4], scale: [1, 1, .55] },
  'Vibe Coding': { color: '#eea5f0', a: [10, 2.5, 1.4, 13.6, 1, 1], b: [12, .5, 10.6, 1.7, .8, 1.2] },
  'Web Development': { color: '#b7d5a0', a: [11, .6, 11, 11, 1, 1], b: [2, .5, .4, 14.9, 1.35, .9] },
};
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const states = new Map();
const meshes = new Map();
const rendered = new Map();
// Each collection gets its physical drop once per browsing session, including
// when the visitor returns to the grid from a project page.
const visited = new Set();
try { JSON.parse(sessionStorage.getItem('project-shape-drops') || '[]').forEach(key => visited.add(key)); } catch {}
let renderer, overlay, ink, scene, camera, frame = 0, previous = 0, flight = null, transferVersion = 0;
let lastScroll = null;

function radius(angle, [m, n1, n2, n3, a = 1, b = 1]) {
  const t = m * angle / 4;
  const sum = Math.abs(Math.cos(t) / a) ** n2 + Math.abs(Math.sin(t) / b) ** n3;
  return sum ? Math.min(50, sum ** (-1 / n1)) : 0;
}
function makeMesh(key) {
  if (meshes.has(key)) return meshes.get(key);
  const config = shapes[key] || shapes['All Projects'];
  const nu = 96, nv = 48, positions = [], indices = [];
  let max = 0;
  for (let j = 0; j <= nv; j++) {
    const phi = -Math.PI / 2 + j / nv * Math.PI, r2 = radius(phi, config.b);
    for (let i = 0; i <= nu; i++) {
      const theta = -Math.PI + i / nu * Math.PI * 2, r1 = radius(theta, config.a);
      const point = [r1 * Math.cos(theta) * r2 * Math.cos(phi), r2 * Math.sin(phi), r1 * Math.sin(theta) * r2 * Math.cos(phi)];
      point.forEach((value, axis) => { const v = value * (config.scale?.[axis] || 1); positions.push(v); max = Math.max(max, Math.abs(v)); });
      if (j < nv && i < nu) { const a = j * (nu + 1) + i, c = a + nu + 1; indices.push(a, c, a + 1, a + 1, c, c + 1); }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions.map(v => v / max), 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: config.color, roughness: .32, metalness: .12, side: THREE.DoubleSide }));
  meshes.set(key, mesh);
  return mesh;
}
function ensureRenderer() {
  if (renderer) return true;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(112, 112); renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(36, 1, .1, 20); camera.position.z = 4.8;
    scene.add(new THREE.AmbientLight(0xffffff, 1.7));
    const key = new THREE.DirectionalLight(0xffffff, 3); key.position.set(-3, 4, 5); scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 1.4); rim.position.set(3, 1, -3); scene.add(rim);
    overlay = document.createElement('canvas'); overlay.className = 'tag-shape-layer'; overlay.setAttribute('aria-hidden', 'true');
    document.body.append(overlay); ink = overlay.getContext('2d'); resize();
    return true;
  } catch (error) { console.warn('Tag shapes unavailable', error); return false; }
}
function resize() {
  if (!overlay) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  overlay.width = Math.round(innerWidth * dpr); overlay.height = Math.round(innerHeight * dpr);
  ink.setTransform(dpr, 0, 0, dpr, 0, 0); wake();
}
function paint(key, x, y, size, rotation, opacity = 1, roll = 0, pitch = 0) {
  let cached = rendered.get(key);
  if (!cached) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 112;
    cached = { canvas, context: canvas.getContext('2d'), rotation: null }; rendered.set(key, cached);
  }
  if (cached.rotation === null || Math.abs(cached.rotation - rotation) > .008 || Math.abs(cached.pitch - pitch) > .008) {
    const mesh = makeMesh(key);
    mesh.rotation.set(1.05 + pitch, .55 + rotation, -.16);
    scene.add(mesh); renderer.render(scene, camera); scene.remove(mesh);
    cached.context.clearRect(0, 0, 112, 112);
    cached.context.drawImage(renderer.domElement, 0, 0);
    cached.rotation = rotation; cached.pitch = pitch;
  }
  ink.globalAlpha = opacity;
  ink.save(); ink.translate(x, y); ink.rotate(-roll);
  ink.drawImage(cached.canvas, -size / 2, -size / 2, size, size);
  ink.restore();
  ink.globalAlpha = 1;
}
function wake() { if (!frame && renderer) frame = requestAnimationFrame(draw); }
function draw(now) {
  frame = 0;
  const dt = Math.min((now - previous) / 1000 || .016, .04); previous = now;
  ink.clearRect(0, 0, innerWidth, innerHeight);
  if (document.body.classList.contains('is-loading')) return;
  let moving = !!flight;
  states.forEach((state, host) => {
    if (!host.isConnected) { states.delete(host); return; }
    const persistent = host.matches('.has-collection-shape, .project-filter[aria-pressed="true"]');
    const active = host.matches(':hover, :focus-visible');
    const target = active || persistent ? 1 : 0;
    state.amount += (target - state.amount) * Math.min(1, dt * 18);
    if (active && !reduced.matches && !state.suppressed) {
      state.turn += dt * .85;
      moving = true;
    }
    // Smooth scroll-driven rotation around the mesh’s horizontal (X) axis.
    state.scrollX += (state.scrollTarget - state.scrollX) * (1 - Math.exp(-18 * dt));
    if (Math.abs(state.scrollTarget - state.scrollX) > .0005) moving = true;
    if (Math.abs(target - state.amount) > .002) moving = true;
    if (state.suppressed || state.amount < .005 || flight?.source === host || (flight && host === flight.target)) return;
    const rect = state.slot.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight || !rect.width) return;
    paint(host.dataset.shapeKey, rect.left + rect.width / 2, rect.top + rect.height / 2, (persistent ? 23 : 27) * state.amount * state.reveal, state.turn, state.amount, 0, state.scrollX);
  });
  if (flight) paint(flight.key, flight.x, flight.y, flight.size, flight.rotation, 1, flight.roll);
  if (moving) wake();
}
function sync() {
  document.querySelectorAll('[data-collection-nav]').forEach(el => { el.dataset.shapeKey = el.dataset.collectionNav; });
  document.querySelectorAll('[data-shape-key]').forEach(host => {
    if (states.has(host)) return;
    const slot = document.createElement('span'); slot.className = 'tag-shape-slot'; slot.setAttribute('aria-hidden', 'true'); host.prepend(slot);
    states.set(host, { slot, amount: 0, turn: 0, scrollX: 0, scrollTarget: 0, reveal: 1 });
    ['pointerenter', 'pointerleave', 'focus', 'blur', 'transitionend'].forEach(type => host.addEventListener(type, () => { if (['pointerenter', 'pointerleave', 'focus', 'blur'].includes(type)) states.get(host).suppressed = false; if (ensureRenderer()) wake(); }));
  });
  wake();
}
function setCollection(button, key) {
  button.dataset.shapeKey = key || 'All Projects';
  button.classList.toggle('has-collection-shape', !!key);
  sync(); if ((key || button.matches('[aria-pressed="true"]')) && ensureRenderer()) wake();
}
function cancel() {
  transferVersion++;
  states.forEach(state => { state.revealTween?.kill(); state.reveal = 1; });
  if (!flight) return;
  const old = flight; flight = null; old.timeline?.kill(); old.source.classList.remove('is-shape-departing');
  old.resolve(false); wake();
}
async function transfer(source, target, key) {
  cancel();
  const version = transferVersion;
  if (reduced.matches || !window.gsap || !ensureRenderer()) return true;
  // Bring the destination back into view before dropping from the fixed nav.
  const rect = target.getBoundingClientRect();
  if (rect.top < 70 || rect.bottom > innerHeight - 40) {
    window.SiteScroll?.scrollTo(0);
    await new Promise(resolve => setTimeout(resolve, 900));
  }
  if (version !== transferVersion) return false;
  sync();
  const from = states.get(source).slot.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const x = from.width ? from.left + from.width / 2 : source.getBoundingClientRect().left - 12;
  const landing = Math.max(to.left + 65, Math.min(x - 20, innerWidth - 36));
  return new Promise(resolve => {
    flight = { source, target, key, x, y: from.top + from.height / 2, size: 30, rotation: states.get(source).turn, roll: 0, resolve };
    const item = flight;
    source.classList.add('is-shape-departing');
    const endX = to.left + 23, endY = to.top + to.height / 2;
    const repeated = visited.has(key);
    item.timeline = gsap.timeline({ onUpdate: wake, onComplete: () => {
      flight = null; source.classList.remove('is-shape-departing'); visited.add(key);
      try { sessionStorage.setItem('project-shape-drops', JSON.stringify([...visited])); } catch {}
      states.get(source).suppressed = true;
      setCollection(target, key);
      const dock = states.get(target);
      dock.amount = 1;
      dock.turn = item.rotation;
      dock.scrollX = dock.scrollTarget = 0;
      dock.reveal = repeated ? 0 : 1;
      if (repeated) dock.revealTween = gsap.to(dock, { reveal: 1, duration: .5, ease: 'power2.out', onUpdate: wake });
      resolve(true); wake();
    }});
    if (repeated) {
      item.size = 27;
      // Resolve after the nav icon disappears; the filter's label animation and
      // the docked icon's growth then begin together.
      item.timeline.to(item, { size: 0, duration: .24, ease: 'power2.in' });
    } else {
      // Positive roll is counter-clockwise in screen space. Keep it increasing
      // through the fall, bounce, travel and final shrink without reversing.
      const turns = Math.max(Math.PI * 2, (landing - endX) / 18);
      const finalRoll = Math.ceil((3 + turns) / (Math.PI * 2)) * Math.PI * 2;
      item.timeline.to(item, { x: landing, y: to.top - 13, roll: .9, duration: .48, ease: 'power2.in' })
        .to(item, { y: to.top - 66, roll: 1.5, duration: .22, ease: 'power2.out' })
        .to(item, { y: to.top - 13, roll: 2.1, duration: .24, ease: 'power2.in' })
        .to(item, { x: endX, roll: finalRoll - .55, duration: .72, ease: 'power2.out' })
        .to(item, { y: endY, roll: finalRoll - .2, duration: .18, ease: 'power2.in' })
        .to(item, { size: 23, roll: finalRoll, duration: .18, ease: 'power2.out' });
    }
    wake();
  });
}
window.ProjectTagIcons = { sync, setCollection, transfer, cancel };
window.addEventListener('resize', resize);
function scrollShapes() {
  // Read the displayed position, including active smooth scrolling.
  const content = document.querySelector('#smooth-content');
  const current = content ? -content.getBoundingClientRect().top : window.scrollY;
  const delta = lastScroll === null ? 0 : current - lastScroll;
  lastScroll = current;
  if (!reduced.matches) states.forEach((state, host) => {
    if (host.matches('.has-collection-shape, .project-filter[aria-pressed="true"]')) state.scrollTarget += delta * .006;
  });
  wake();
}
window.addEventListener('scroll', scrollShapes, { passive: true });
window.addEventListener('site-scroll:update', scrollShapes);
window.addEventListener('project-filters:selected', () => { if (ensureRenderer()) wake(); });
window.addEventListener('project-filters:rendered', sync);
window.addEventListener('page-loader:hidden', wake);
reduced.addEventListener('change', () => { cancel(); wake(); });
sync();
// Restore persistent collection shape if this module finished after the filter script.
const all = document.querySelector('.project-filter--all');
if (all) setCollection(all, all.dataset.collectionShape || null);
scrollShapes();

window.dispatchEvent(new CustomEvent('tag-shapes:ready'));
// Carry the requested handoff to the grid when a nav link starts on a project page.
if (!document.querySelector('.project-filters')) {
  document.querySelectorAll('[data-collection-nav]').forEach(link => link.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    try { sessionStorage.setItem('project-shape-arrival', link.dataset.collectionNav); } catch {}
  }));
}
