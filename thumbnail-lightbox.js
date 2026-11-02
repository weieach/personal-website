// --------------------------
// Thumbnail lightbox: cards that don't open a project page (Archive cards and
// data-project-details="false" cards that aren't in development) open their
// thumbnail's image or video in a fullscreen blurred overlay instead.
// --------------------------
(() => {
  const grid = document.querySelector("[data-project-grid]");
  if (!grid) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const cardSelector = "[data-project-grid] > .card";
  const controls = "a, button, .thumbnail-cta";

  const isArchived = (card) =>
    card.dataset.collection?.toLowerCase() === "archive" ||
    Boolean(card.closest('[data-project-collection="archive"]'));

  const opensLightbox = (card) => isArchived(card) || (
    card.dataset.projectStatus !== "in-development" &&
    card.dataset.projectDetails === "false"
  );

  const titleOf = (card) =>
    (card.querySelector(".work-title .bold") ||
      card.querySelector(".project-title-label, .work-title"))?.textContent.trim() || "";

  // The media the thumbnail is currently showing (archive sequences cycle frames).
  const mediaOf = (thumb) => {
    const candidates = [...thumb.querySelectorAll("img, video")]
      .filter((el) => !el.closest(controls));
    return candidates.find((el) => el.tagName === "VIDEO") ||
      candidates.find((el) => el.style.visibility === "visible") ||
      candidates[0] || null;
  };

  // What the visitor sees for that media (Pictogram paints its video on a canvas).
  const visibleBox = (media) => {
    const canvas = media.nextElementSibling;
    if (media.classList.contains("pictogram-source") && canvas?.classList.contains("pictogram-visual")) {
      return canvas;
    }
    return media.closest(".thumb-phone-screen") || media;
  };

  // The thumbnail's corner radius as a share of the visible media's width: the
  // media's own rounding (floating screens), else the thumbnail frame's when the
  // media fills it. Inset media inside a plain frame stays square.
  const radiusRatio = (media, thumb) => {
    const box = visibleBox(media);
    for (let el = box; el && el !== thumb; el = el.parentElement) {
      const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius);
      if (radius && el.offsetWidth) return radius / el.offsetWidth;
    }
    const radius = parseFloat(getComputedStyle(thumb).borderTopLeftRadius);
    const a = box.getBoundingClientRect();
    const b = thumb.getBoundingClientRect();
    const fills = a.left <= b.left + 1 && a.right >= b.right - 1 &&
      a.top <= b.top + 1 && a.bottom >= b.bottom - 1;
    return fills && radius && b.width ? radius / b.width : 0;
  };

  const thumbs = [...grid.querySelectorAll(":scope > .card")]
    .filter(opensLightbox)
    .map((card) => card.querySelector(".card-thumbnail"))
    .filter((thumb) => thumb && mediaOf(thumb));

  if (!thumbs.length) return;

  thumbs.forEach((thumb) => {
    const title = titleOf(thumb.closest(".card"));
    thumb.classList.add("is-lightbox-trigger");
    thumb.setAttribute("role", "button");
    thumb.setAttribute("tabindex", "0");
    thumb.setAttribute("aria-haspopup", "dialog");
    thumb.setAttribute("aria-label", title ? `View ${title} full screen` : "View full screen");
  });

  const overlay = document.createElement("div");
  overlay.className = "thumb-lightbox";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.hidden = true;
  overlay.innerHTML = `
    <button type="button" class="thumb-lightbox__close" aria-label="Close">
      <i class="ph ph-x" aria-hidden="true"></i>
    </button>
    <div class="thumb-lightbox__frame"></div>
  `;
  document.body.appendChild(overlay);

  const frame = overlay.querySelector(".thumb-lightbox__frame");
  const closeButton = overlay.querySelector(".thumb-lightbox__close");
  let current = null;

  const sizeOf = (media) => ({
    width: media.videoWidth || media.naturalWidth || Number(media.getAttribute("width")) || 16,
    height: media.videoHeight || media.naturalHeight || Number(media.getAttribute("height")) || 9,
  });

  // Grow out of the thumbnail's media box into the overlay frame.
  const zoomIn = (from) => {
    if (reduceMotion.matches || !from || !frame.animate) return;
    const a = from.getBoundingClientRect();
    const b = frame.getBoundingClientRect();
    if (!a.width || !b.width || a.bottom < 0 || a.top > innerHeight) return;
    const scale = a.width / b.width;
    const dx = a.left + a.width / 2 - (b.left + b.width / 2);
    const dy = a.top + a.height / 2 - (b.top + b.height / 2);
    frame.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.6 },
      { transform: "none", opacity: 1 },
    ], { duration: 460, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
  };

  // Pictogram's thumbnail is a canvas that paints the video over a background
  // sampled from the frame (see script.js), so the padding matches the video's
  // own blue. Mirror that canvas instead of showing the bare video.
  const mirrorCanvas = (source) => {
    const visual = visibleBox(source);
    if (visual.tagName !== "CANVAS") return null;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // Until the first copied frame, show the thumbnail's own background.
    canvas.style.backgroundColor = getComputedStyle(source.closest(".card-thumbnail")).backgroundColor;
    let raf = 0;
    const paint = () => {
      // Wait for script.js to size it square (a fresh canvas is 300 × 150).
      if (visual.width && visual.width === visual.height) {
        if (canvas.width !== visual.width || canvas.height !== visual.height) {
          canvas.width = visual.width;
          canvas.height = visual.height;
        }
        ctx.drawImage(visual, 0, 0);
      }
      raf = requestAnimationFrame(paint);
    };
    paint();
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", titleOf(source.closest(".card")));
    return { canvas, stop: () => cancelAnimationFrame(raf), size: Math.max(...Object.values(sizeOf(source))) };
  };

  function open(thumb) {
    const source = mediaOf(thumb);
    if (!source || current) return;
    window.SiteMedia?.load(source);

    let { width, height } = sizeOf(source);
    const ratio = radiusRatio(source, thumb);
    const mirror = source.classList.contains("pictogram-source") ? mirrorCanvas(source) : null;
    // The mirrored thumbnail keeps playing; only a standalone copy pauses it.
    const isVideo = source.tagName === "VIDEO" && !mirror;
    let preview;

    if (mirror) {
      preview = mirror.canvas;
      // The thumbnail canvas is square; size it from the video, not the canvas
      // (which reports a default 300px until its first frame).
      width = height = mirror.size;
    } else if (isVideo) {
      preview = document.createElement("video");
      // Match the thumbnail's CORS mode so the cached response is reused.
      preview.crossOrigin = source.crossOrigin || null;
      preview.src = source.currentSrc || source.src;
      if (source.poster) preview.poster = source.poster;
      preview.loop = true;
      preview.playsInline = true;
      preview.muted = source.muted || source.volume === 0;
      preview.autoplay = true;
      const startAt = source.currentTime;
      preview.addEventListener("loadedmetadata", () => {
        if (startAt && startAt < preview.duration) preview.currentTime = startAt;
      }, { once: true });
      if (source.getAttribute("aria-label")) preview.setAttribute("aria-label", source.getAttribute("aria-label"));
      // Pause the thumbnail so only one copy plays (and only one is ever audible).
      if (window.SiteMedia) window.SiteMedia.setBlocked(source, true);
      else source.pause();
    } else {
      preview = document.createElement("img");
      preview.crossOrigin = source.crossOrigin || null;
      preview.src = source.currentSrc || source.src;
      preview.alt = source.alt || "";
    }
    preview.classList.add("thumb-lightbox__media");

    const title = titleOf(thumb.closest(".card"));
    overlay.setAttribute("aria-label", title || "Media preview");
    overlay.style.setProperty("--media-ratio", `${width} / ${height}`);
    overlay.style.setProperty("--media-width", `${width}px`);
    overlay.style.setProperty("--radius-ratio", String(ratio));
    frame.getAnimations?.().forEach((animation) => animation.cancel());
    frame.style.removeProperty("transform");
    frame.style.removeProperty("opacity");
    frame.replaceChildren(preview);

    current = { thumb, source, isVideo, stop: mirror?.stop };
    overlay.hidden = false;
    document.documentElement.classList.add("is-thumb-lightbox-open");
    // Commit the hidden state before transitioning in.
    void overlay.offsetWidth;
    overlay.classList.add("is-open");
    zoomIn(visibleBox(source));
    if (isVideo) preview.play?.().catch(() => {});
    closeButton.focus({ preventScroll: true });
  }

  function close() {
    if (!current) return;
    const { thumb, source, isVideo, stop } = current;
    current = null;

    const finish = () => {
      if (current) return;
      overlay.hidden = true;
      stop?.();
      frame.getAnimations?.().forEach((animation) => animation.cancel());
      const preview = frame.firstElementChild;
      if (preview?.tagName === "VIDEO") {
        preview.pause();
        preview.removeAttribute("src");
        preview.load();
      }
      frame.replaceChildren();
    };

    overlay.classList.remove("is-open");
    document.documentElement.classList.remove("is-thumb-lightbox-open");
    if (isVideo) {
      if (window.SiteMedia) window.SiteMedia.setBlocked(source, false);
      else source.play().catch(() => {});
    }
    thumb.focus({ preventScroll: true });

    if (reduceMotion.matches || !frame.animate) {
      finish();
      return;
    }
    // Shrink slightly and fade out in place while the backdrop fades.
    // Start from wherever the opening zoom currently is.
    frame.getAnimations().forEach((animation) => {
      if (animation.playState === "running") {
        try { animation.commitStyles(); } catch {}
      }
      animation.cancel();
    });
    frame.animate([
      { transform: getComputedStyle(frame).transform, opacity: getComputedStyle(frame).opacity },
      { transform: "scale(0.94)", opacity: 0 },
    ], { duration: 240, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" })
      .finished.then(() => {
        frame.style.removeProperty("transform");
        frame.style.removeProperty("opacity");
        finish();
      }, finish);
  }

  const triggerOf = (target) => {
    if (document.documentElement.classList.contains("dev-mode")) return null;
    if (target.closest(controls)) return null;
    const thumb = target.closest(".card-thumbnail.is-lightbox-trigger");
    return thumb?.closest(cardSelector) ? thumb : null;
  };

  grid.addEventListener("click", (event) => {
    const thumb = triggerOf(event.target);
    if (!thumb) return;
    event.preventDefault();
    open(thumb);
  });

  grid.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (!event.target.matches?.(".card-thumbnail.is-lightbox-trigger")) return;
    const thumb = triggerOf(event.target);
    if (!thumb) return;
    event.preventDefault();
    open(thumb);
  });

  // Any click closes it; there is nothing interactive inside but the close button.
  overlay.addEventListener("click", close);

  document.addEventListener("keydown", (event) => {
    if (!current) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      // Keep focus inside the dialog.
      event.preventDefault();
      closeButton.focus();
    }
  });
})();
