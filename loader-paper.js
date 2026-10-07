import * as THREE from 'three';

// Each loading cover gets a new release angle, leading edge and curl direction.
// Sample once per sheet so resizing never changes an animation already in flight.
export function createPaper(loader) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'page-loader__paper';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  loader.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 30);
  camera.position.z = 3;
  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const overhead = new THREE.DirectionalLight(0xffffff, 3.2);
  overhead.position.set(0, 4, 2);
  scene.add(overhead);

  const grain = document.createElement('canvas');
  grain.width = grain.height = 256;
  const ctx = grain.getContext('2d');
  const pixels = ctx.createImageData(256, 256);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const value = 180 + Math.random() * 75;
    pixels.data.set([value, value, value, 255], i);
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(grain);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  const geometry = new THREE.PlaneGeometry(2, 2, 40, 64);
  const material = new THREE.MeshStandardMaterial({ color: 0x252525, map: texture, bumpMap: texture, bumpScale: 0.004, roughness: 0.95, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const positions = geometry.attributes.position;
  const motion = {
    lead: Math.random() < .5 ? -1 : 1,
    curl: Math.random() < .5 ? -1 : 1,
    lag: .14 + Math.random() * .2,
    bend: .75 + Math.random() * .8,
    drift: (Math.random() - .5) * .55,
    tilt: (Math.random() - .5) * .4,
  };
  let halfHeight, halfWidth, progress = 0, disposed = false;

  function update(value) {
    if (disposed) return;
    progress = value;
    for (let column = 0; column <= 40; column++) {
      const x = -1 + column / 20;
      let y = -halfHeight, z = 0;
      const ys = [y], zs = [z];
      for (let row = 1; row <= 64; row++) {
        const height = row / 64;
        // The opposite edge follows the randomly chosen leading corner.
        const delay = motion.lag * (1 + x * motion.lead) / 2 + .12 * (1 - height);
        const t = Math.max(0, Math.min(1, (value - delay) / (1 - delay)));
        const angle = motion.curl * (1.7 * t * t + Math.sin(Math.PI * t) * motion.bend * height);
        y += (2 * halfHeight / 64) * Math.cos(angle);
        z -= (2 * halfHeight / 64) * Math.sin(angle);
        ys[row] = y; zs[row] = z;
      }
      for (let row = 0; row <= 64; row++) {
        const height = row / 64;
        const delay = motion.lag * (1 + x * motion.lead) / 2 + .12 * (1 - height);
        const t = Math.max(0, Math.min(1, (value - delay) / (1 - delay)));
        const drop = 3.6 * halfHeight * Math.pow(t, 2.4);
        const cornerCurl = motion.curl * Math.sin(Math.PI * t) * (1 - x * motion.lead) * height * height * .24;
        const i = (64 - row) * 41 + column;
        const tilt = motion.tilt * Math.sin(Math.PI * value);
        const px = x * halfWidth;
        const py = ys[row] - drop - cornerCurl;
        positions.setXYZ(i,
          px * Math.cos(tilt) - py * Math.sin(tilt) + motion.drift * halfWidth * value * value,
          px * Math.sin(tilt) + py * Math.cos(tilt),
          zs[row] - cornerCurl);
      }
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    renderer.render(scene, camera);
  }
  function resize() {
    const width = innerWidth, height = innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    halfHeight = 3 * Math.tan(THREE.MathUtils.degToRad(20)) * 1.003;
    halfWidth = halfHeight * camera.aspect;
    renderer.setSize(width, height, false);
    texture.repeat.set(width / 72, height / 72);
    update(progress);
  }
  resize();
  loader.classList.add('page-loader--paper-ready');
  window.addEventListener('resize', resize);
  return {
    update,
    dispose() {
      disposed = true;
      window.removeEventListener('resize', resize);
      geometry.dispose(); material.dispose(); texture.dispose(); renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

export function installLoaderExit(loader, bird, reduceMotion) {
  let paper;
  if (!reduceMotion) {
    try { paper = createPaper(loader); }
    catch (error) { console.warn('Paper renderer unavailable; using the loader fallback.', error); }
  }
  window.SiteLoader = {
    freeze: () => bird?.freeze(),
    async exit() {
      bird?.freeze();
      loader.classList.add('page-loader--exiting');
      const bar = loader.querySelector('.page-loader__identity');
      const tip = loader.querySelector('.page-loader__tip');
      const mark = loader.querySelector('.page-loader__mark');
      const beginFall = () => {
        loader.dataset.falling = 'true';
        window.dispatchEvent(new CustomEvent('page-loader:falling'));
      };
      try {
        if (!window.gsap || reduceMotion) {
          beginFall();
          await loader.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' }).finished;
          return;
        }
        await new Promise(resolve => {
          const state = { progress: 0 };
          const tl = gsap.timeline({ onComplete: resolve });
          tl.to([bar, tip].filter(Boolean), { opacity: 0, duration: 0.18, ease: 'power1.out' });
          tl.call(beginFall, [], 0.2);
          tl.to(mark, { y: -(innerHeight * 0.65 + mark.offsetHeight), duration: 0.8, ease: 'power3.in' }, 0.2);
          tl.to(mark, { scaleY: 1.24, scaleX: 0.94, duration: 0.4, ease: 'power2.in' }, 0.5);
          if (paper) {
            tl.to(state, { progress: 1, duration: 1.45, ease: 'none', onUpdate: () => paper.update(state.progress) }, 0.2);
          } else {
            // Keep a geometric exit if WebGL is unavailable.
            tl.to(loader, { yPercent: 110, rotateX: -18, transformPerspective: 1000, duration: 1.2, ease: 'power2.in' }, 0.2);
          }
        });
      } finally {
        paper?.dispose();
        bird?.dispose();
      }
    },
  };
}
