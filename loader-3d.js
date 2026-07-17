import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const MODEL_URL = "assets/Bird.glb";
const ROTATION_SPEED = 0.55; // radians per second
const TILT_FORWARD = -0.55; // radians on X (nod toward camera)
const TILT_MS = 160;
const TILT_HOLD_MS = 70;
const TILT_BACK_MS = 220;
// ? and ? (unicode escapes keep encoding stable)
const CHIRP_DOT = "\u00B7";
const CHIRP_STAR = "\u2736";

const reduceMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;

/** Shared GLB promise so index loader + about bird don't double-fetch. */
let modelPromise = null;

function loadModel() {
  if (!modelPromise) {
    const loader = new GLTFLoader();
    modelPromise = new Promise((resolve, reject) => {
      loader.load(MODEL_URL, resolve, undefined, reject);
    });
  }
  return modelPromise;
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function animateValue(from, to, durationMs, onUpdate) {
  if (durationMs <= 0 || reduceMotion) {
    onUpdate(to);
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      onUpdate(from + (to - from) * easeInOut(t));
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

function ensureChirpLayer(canvas) {
  const host = canvas.parentElement;
  if (!host) return null;

  const style = getComputedStyle(host);
  if (style.position === "static") {
    host.style.position = "relative";
  }

  let layer = host.querySelector(":scope > .bird-chirps");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "bird-chirps";
    layer.setAttribute("aria-hidden", "true");
    host.appendChild(layer);
  }

  // Match the canvas box so glyphs burst from the bird, not the avatar.
  const hostRect = host.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  layer.style.left = `${canvasRect.left - hostRect.left}px`;
  layer.style.top = `${canvasRect.top - hostRect.top}px`;
  layer.style.width = `${canvasRect.width}px`;
  layer.style.height = `${canvasRect.height}px`;
  layer.style.right = "auto";
  layer.style.bottom = "auto";

  return layer;
}

function spawnChirps(canvas) {
  const layer = ensureChirpLayer(canvas);
  if (!layer) return;

  // Collective lift for the whole burst, plus a narrow upward fan.
  const collectiveUp = -(32 + Math.random() * 12);
  layer.classList.remove("is-chirping");
  // Restart layer lift animation
  void layer.offsetWidth;
  layer.classList.add("is-chirping");

  const count = 10 + Math.floor(Math.random() * 5);
  const dotCount = Math.ceil(count * 0.5);
  const glyphs = [
    ...Array(dotCount).fill(CHIRP_DOT),
    ...Array(count - dotCount).fill(CHIRP_STAR),
  ];
  for (let i = glyphs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [glyphs[i], glyphs[j]] = [glyphs[j], glyphs[i]];
  }

  for (let i = 0; i < count; i++) {
    const el = document.createElement("span");
    el.className = "bird-chirp";
    el.textContent = glyphs[i];

    // Upward cone with wide left/right spread
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.85;
    const dist = 28 + Math.random() * 56;
    const dx = Math.cos(angle) * dist * 1.9;
    const dy = Math.sin(angle) * dist * 1.15 + collectiveUp;
    const delay = Math.random() * 90;
    const size = 0.75 + Math.random() * 0.65;

    el.style.setProperty("--dx", `${dx.toFixed(1)}px`);
    el.style.setProperty("--dy", `${dy.toFixed(1)}px`);
    el.style.setProperty("--delay", `${delay.toFixed(0)}ms`);
    el.style.setProperty("--size", size.toFixed(2));
    el.style.left = `${50 + (Math.random() * 20 - 10)}%`;
    el.style.top = `${42 + (Math.random() * 10 - 3)}%`;

    layer.appendChild(el);
    window.setTimeout(() => el.remove(), 1200 + delay);
  }

  window.setTimeout(() => layer.classList.remove("is-chirping"), 1100);
}

function mountBird(canvas, { onReady, shouldDispose } = {}) {
  if (!canvas) return;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
  camera.position.set(0, 0.15, 2.4);

  scene.add(new THREE.AmbientLight(0xffffff, 0.85));

  const key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(2.2, 3.2, 2.8);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xffffff, 0.45);
  fill.position.set(-2.4, 0.6, -1.2);
  scene.add(fill);

  const pivot = new THREE.Group();
  scene.add(pivot);

  let model = null;
  let rafId = 0;
  let disposed = false;
  let spinning = true;
  let chirping = false;
  let spinElapsed = 0;
  let tiltX = 0;
  const clock = new THREE.Clock();

  canvas.style.cursor = "pointer";
  canvas.setAttribute("role", "button");
  canvas.setAttribute("tabindex", "0");
  canvas.setAttribute("aria-label", "Chirp the bird");

  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function fitModel(object) {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    object.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const fitHeightDistance =
      maxDim / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5));
    const fitWidthDistance = fitHeightDistance / camera.aspect;
    const distance = Math.max(fitHeightDistance, fitWidthDistance) * 1.35;

    camera.position.set(0, size.y * 0.04, distance);
    camera.near = distance / 100;
    camera.far = distance * 100;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }

  async function playChirp() {
    if (!model || chirping || disposed) return;
    chirping = true;
    spinning = false;
    spawnChirps(canvas);

    if (reduceMotion) {
      await wait(120);
      spinning = true;
      chirping = false;
      return;
    }

    await animateValue(tiltX, TILT_FORWARD, TILT_MS, (v) => {
      tiltX = v;
    });
    await wait(TILT_HOLD_MS);
    await animateValue(tiltX, 0, TILT_BACK_MS, (v) => {
      tiltX = v;
    });

    spinning = true;
    chirping = false;
  }

  function onActivate(e) {
    e.preventDefault();
    playChirp();
  }

  function onKeydown(e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    playChirp();
  }

  canvas.addEventListener("click", onActivate);
  canvas.addEventListener("keydown", onKeydown);

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(rafId);
    canvas.removeEventListener("click", onActivate);
    canvas.removeEventListener("keydown", onKeydown);
    pivot.clear();
    renderer.dispose();
  }

  function tick() {
    if (disposed || !canvas.isConnected || shouldDispose?.()) {
      dispose();
      return;
    }

    rafId = requestAnimationFrame(tick);
    const delta = clock.getDelta();
    resize();

    if (model) {
      if (spinning && !reduceMotion) {
        spinElapsed += delta;
      }
      model.rotation.y = spinElapsed * ROTATION_SPEED;
      model.rotation.x = tiltX;
    }

    renderer.render(scene, camera);
  }

  resize();
  tick();

  loadModel()
    .then((gltf) => {
      if (disposed) return;
      model = gltf.scene.clone(true);
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = false;
          child.receiveShadow = false;
        }
      });
      pivot.add(model);
      fitModel(model);
      onReady?.(true);
    })
    .catch((err) => {
      console.error("Failed to load Bird.glb", err);
      onReady?.(false);
    });

  return { dispose };
}

// --------------------------
// Page loader (index.html)
// --------------------------
(() => {
  const canvas = document.getElementById("page-loader-canvas");
  const loaderEl = document.getElementById("page-loader");
  if (!canvas || !loaderEl) return;

  const api = mountBird(canvas, {
    onReady: () => {
      const mark = canvas.closest(".page-loader__mark");
      mark?.classList.add("is-ready");
      loaderEl.dataset.modelReady = "true";
      window.dispatchEvent(new CustomEvent("page-loader:model-ready"));
    },
    shouldDispose: () =>
      !loaderEl.isConnected ||
      loaderEl.classList.contains("page-loader--hidden"),
  });

  const observer = new MutationObserver(() => {
    if (
      !loaderEl.isConnected ||
      loaderEl.classList.contains("page-loader--hidden")
    ) {
      api?.dispose();
      observer.disconnect();
    }
  });
  observer.observe(loaderEl, {
    attributes: true,
    attributeFilter: ["class"],
  });
})();

// --------------------------
// About page avatar accent
// --------------------------
(() => {
  const canvas = document.getElementById("about-bird-canvas");
  if (!canvas) return;

  const start = () => {
    mountBird(canvas, {
      onReady: (ok) => {
        if (!ok) return;
        canvas.classList.add("is-ready");
        canvas.closest(".about-bird-wrap")?.classList.add("is-ready");
      },
    });
  };

  // Bird loads only after the postcard is flipped to the content side
  const postcard = document.getElementById("about-postcard");
  if (!postcard || postcard.classList.contains("is-flipped")) {
    start();
  } else {
    window.addEventListener("about-postcard:flipped", start, { once: true });
  }
})();
