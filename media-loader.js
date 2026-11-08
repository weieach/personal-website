(() => {
  "use strict";

  // With scripting enabled these are inert text, but still count in CSS
  // nth-child selectors (the collage and archive sequences rely on those).
  document.querySelectorAll("noscript[data-media-fallback]").forEach(node => node.remove());

  const config = window.SiteMediaConfig || {};
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const media = [...document.querySelectorAll("img[data-media-src], video[data-media-src]")];
  const states = new WeakMap();
  let frame = 0;

  function url(local, fallback = false) {
    if (!local || fallback || !config.baseUrl) return local;
    const path = decodeURIComponent(local.split(/[?#]/)[0]).replace(/^\.\//, "").replace(/^\//, "");
    // Only verified uploads are routed to R2. New/unlisted files stay local.
    const key = config.assets?.[path];
    return key ? `${config.baseUrl.replace(/\/$/, "")}/${key.split("/").map(encodeURIComponent).join("/")}` : local;
  }

  function srcset(value, fallback) {
    return value.split(",").map(candidate => {
      const [path, ...descriptor] = candidate.trim().split(/\s+/);
      return [url(path, fallback), ...descriptor].join(" ");
    }).join(", ");
  }

  function box(element) {
    // Pictogram's source video is visually hidden behind its canvas.
    return element.closest(".card-thumbnail, .page-thumbnail-nijimu") || element;
  }

  function inRange(element, margin = 0) {
    const target = box(element);
    if (!element.isConnected || element.closest("[hidden], .no-display") || !target.getClientRects().length) return false;
    if (!element.getClientRects().length && !element.classList.contains("pictogram-source")) return false;
    // CSS-hidden mobile/desktop variants must not download in the background.
    if (getComputedStyle(element).display === "none" && !element.classList.contains("pictogram-source")) return false;
    const rect = target.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > -margin && rect.top < innerHeight + margin && rect.right > 0 && rect.left < innerWidth;
  }

  function loadImage(img, fallback = false) {
    const state = states.get(img);
    if (!state || (state.loaded && !fallback)) return;
    state.loaded = true;
    state.fallback = fallback;
    img.crossOrigin = "anonymous"; // Playground samples image edge colors on canvas.
    img.closest("picture")?.querySelectorAll("source[data-media-srcset]").forEach(source => {
      source.srcset = srcset(source.dataset.mediaSrcset, fallback);
    });
    if (img.dataset.mediaSrcset) img.srcset = srcset(img.dataset.mediaSrcset, fallback);
    img.src = url(img.dataset.mediaSrc, fallback);
  }

  function loadVideo(video, fallback = false) {
    const state = states.get(video);
    if (!state || (state.loaded && !fallback)) return;
    state.loaded = true;
    state.fallback = fallback;
    // Ordinary videos can play cross-origin without CORS; canvas-rendered videos
    // keep anonymous CORS so their frames remain readable.
    if (video.dataset.mediaCrossorigin === "none") video.removeAttribute("crossorigin");
    else video.crossOrigin = "anonymous";
    video.src = url(video.dataset.mediaSrc, fallback);
    // preload=none leaves full downloads to playback, even after attaching src.
    video.load();
  }

  function pause(video) {
    const state = states.get(video);
    if (!video.paused) {
      state.controllerPause = true;
      state.resume = true;
      video.pause();
    }
  }

  function play(video) {
    const state = states.get(video);
    if (!state || state.pending || !video.paused || state.failed) return;
    loadVideo(video);
    state.pending = true;
    video.play().catch(error => {
      if (error.name === "NotAllowedError") {
        state.manualPaused = true;
        video.controls = true;
      }
    }).finally(() => { state.pending = false; });
  }

  function sync(video) {
    const state = states.get(video);
    if (!state) return;
    if (document.hidden || document.body.classList.contains("is-loading") || !inRange(video) || state.blocked) {
      pause(video);
      return;
    }
    // The Nijimu collage owns its sequence timing, including explicit pauses.
    if (video.dataset.mediaManaged === "external") return;
    const auto = video.hasAttribute("data-media-autoplay") && !reducedMotion.matches;
    if (!state.manualPaused && (auto || state.resume)) play(video);
  }

  // Thumbnails keep a loading shimmer (style.css) until what they show has
  // loaded: their lead media and any CSS backgrounds, so a background can't
  // paint ahead of the image in front of it.
  const thumbs = new Map([...document.querySelectorAll(".card .card-thumbnail")].map(thumb => [thumb, {
    backgrounds: false, ready: false, timer: 0,
  }]));
  const preloads = new Map();
  const loadedUrls = new Set();

  function preload(src) {
    if (!preloads.has(src)) {
      preloads.set(src, new Promise(resolve => {
        const img = new Image();
        img.src = src;
        img.decode().then(resolve, resolve);
      }).then(() => { loadedUrls.add(src); }));
    }
    return preloads.get(src);
  }

  function backgroundUrls(element) {
    return [getComputedStyle(element), getComputedStyle(element, "::before")].flatMap(style =>
      [...style.backgroundImage.matchAll(/url\((["']?)(.+?)\1\)/g)].map(match => match[2]));
  }

  function lead(thumb) {
    // The first media CSS shows; an archive sequence starts on its first frame.
    return [...thumb.querySelectorAll("img[data-media-src], video[data-media-src]")].find(element =>
      element.classList.contains("pictogram-source") || getComputedStyle(element).display !== "none");
  }

  function shown(element) {
    const state = states.get(element);
    if (state.failed) return true;
    if (element.tagName === "IMG") return state.loaded && element.complete && element.naturalWidth > 0;
    if (element.readyState >= 2) return true;
    // Pictogram paints frames to a canvas, so its hidden video's poster never shows.
    return !element.classList.contains("pictogram-source") && loadedUrls.has(element.poster);
  }

  function reveal(thumb) {
    const state = thumbs.get(thumb);
    if (state.ready) return;
    state.ready = true;
    clearTimeout(state.timer);
    thumb.dataset.thumbState = "ready";
    setTimeout(() => { thumb.dataset.thumbState = "done"; }, 1000);
  }

  function settle(thumb) {
    const state = thumbs.get(thumb);
    if (!state || state.ready || !state.backgrounds) return;
    const element = lead(thumb);
    if (!element || shown(element)) return reveal(thumb);
    // A video without a poster may never decode a frame (e.g. reduced motion
    // skips playback); don't leave it shimmering indefinitely.
    if (element.tagName === "VIDEO" && states.get(element).loaded && !state.timer) {
      state.timer = setTimeout(() => reveal(thumb), 12000);
    }
  }

  function prepare(element) {
    if (element.tagName === "IMG") return loadImage(element);
    if (element.dataset.mediaPoster && !element.poster) {
      // Keep tiny posters local: they remain available during a CDN outage.
      element.poster = element.dataset.mediaPoster;
      const thumb = element.closest(".card-thumbnail");
      preload(element.poster).then(() => settle(thumb));
    }
    if (element.dataset.mediaManaged !== "external") loadVideo(element);
    if (reducedMotion.matches && element.hasAttribute("data-media-autoplay")) element.controls = true;
    sync(element);
  }

  function refresh() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      media.forEach(element => {
        if (inRange(element, 350)) prepare(element);
        else if (element.tagName === "VIDEO") pause(element);
      });
    });
  }

  const observer = "IntersectionObserver" in window ? new IntersectionObserver(refresh, {
    rootMargin: "350px 0px", threshold: [0, 0.01, 1],
  }) : null;

  media.forEach(element => {
    const state = { loaded: false, fallback: false, manualPaused: false, resume: false, blocked: false };
    states.set(element, state);
    element.addEventListener("error", () => {
      if (!state.loaded || state.fallback) { state.failed = true; return; }
      const remote = url(element.dataset.mediaSrc) !== element.dataset.mediaSrc;
      // A picture's selected source can be remote even if its img fallback isn't.
      const remotePicture = element.closest("picture")?.querySelector("source[data-media-srcset]") && config.baseUrl;
      if (!remote && !remotePicture) { state.failed = true; return; }
      if (element.tagName === "IMG") loadImage(element, true);
      else { loadVideo(element, true); refresh(); }
    });
    if (element.tagName === "VIDEO") {
      element.autoplay = false;
      element.addEventListener("play", () => {
        state.manualPaused = false;
        if (document.hidden || !inRange(element) || state.blocked) pause(element);
      });
      element.addEventListener("pause", () => {
        if (state.controllerPause) { state.controllerPause = false; return; }
        if (inRange(element) && !document.hidden) {
          state.manualPaused = true;
          state.resume = false;
        }
      });
      element.addEventListener("ended", () => { state.resume = false; state.manualPaused = true; });
    }
    // Registered after the error handler above, so a final failure is already recorded.
    const thumb = element.closest(".card-thumbnail");
    if (thumbs.has(thumb)) {
      ["load", "loadeddata", "error"].forEach(type => element.addEventListener(type, () => settle(thumb)));
    }
    observer?.observe(box(element));
  });

  thumbs.forEach((state, thumb) => {
    thumb.dataset.thumbState = "loading";
    Promise.all(backgroundUrls(thumb).map(preload)).then(() => {
      state.backgrounds = true;
      settle(thumb);
    });
  });

  window.SiteMedia = {
    url,
    refresh,
    load(element) { element.tagName === "VIDEO" ? loadVideo(element) : loadImage(element); },
    setBlocked(video, blocked) {
      const state = states.get(video);
      if (!state) return;
      state.blocked = blocked;
      sync(video);
    },
  };
  window.addEventListener("scroll", refresh, { passive: true });
  window.addEventListener("resize", refresh, { passive: true });
  window.addEventListener("pageshow", refresh);
  window.addEventListener("project-filters:selected", refresh);
  window.addEventListener("page-loader:hidden", refresh);
  // Background tabs suspend animation frames, so pause synchronously here.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) media.filter(el => el.tagName === "VIDEO").forEach(pause);
    else refresh();
  });
  window.addEventListener("pagehide", () => media.filter(el => el.tagName === "VIDEO").forEach(pause));
  reducedMotion.addEventListener("change", () => {
    media.filter(el => el.tagName === "VIDEO").forEach(video => {
      if (reducedMotion.matches) { pause(video); states.get(video).resume = false; }
    });
    refresh();
  });
  refresh();
})();
