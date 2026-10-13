(() => {
  const grid = document.querySelector("[data-project-grid]");
  if (!grid || !window.ResizeObserver) return;

  const cards = [...grid.querySelectorAll(":scope > .card")];
  const desktop = window.matchMedia("(min-width: 960px)");
  // A screen counts as floating once it clears every thumbnail edge by this
  // share of the thumbnail's shorter side.
  const insetRatio = 0.04;
  let frame = 0;

  function frameSize(el) {
    const width = el.videoWidth || el.naturalWidth || Number(el.getAttribute("width")) || 0;
    const height = el.videoHeight || el.naturalHeight || Number(el.getAttribute("height")) || 0;
    return { width, height };
  }

  function desktopScreens(thumb) {
    return [...thumb.querySelectorAll("img, video")].filter((el) => {
      if (el.closest(".thumbnail-cta, .btn-visit-site, .btn-sound, .btn-project-status")) return false;
      if (el.classList.contains("pictogram-source")) return false;
      const { width, height } = frameSize(el);
      return width > height;
    });
  }

  function floatsInFrame(thumb) {
    if (!desktop.matches || thumb.offsetParent === null) return false;
    const bounds = thumb.getBoundingClientRect();
    if (bounds.width < 1 || bounds.height < 1) return false;
    const screens = desktopScreens(thumb);
    if (!screens.length) return false;
    const threshold = Math.min(bounds.width, bounds.height) * insetRatio;
    return screens.every((el) => {
      const box = el.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) return false;
      const inset = Math.min(
        box.left - bounds.left,
        bounds.right - box.right,
        box.top - bounds.top,
        bounds.bottom - box.bottom
      );
      return inset >= threshold;
    });
  }

  function layout() {
    frame = 0;
    grid.classList.toggle("is-masonry", desktop.matches);
    // Use the grid's resolved side padding so the vertical gap follows the
    // same rem-based spacing at every root font size.
    const itemGap = parseFloat(getComputedStyle(grid).paddingInlineStart) || 0;
    // One-pixel grid tracks allow each card to occupy only its own height.
    // Dense placement fills the next available column without shared row heights.
    const spans = cards.map((card) => desktop.matches && card.offsetHeight
      ? `span ${Math.ceil(card.getBoundingClientRect().height + itemGap)}`
      : "");
    cards.forEach((card, index) => {
      if (card.style.gridRowEnd !== spans[index]) card.style.gridRowEnd = spans[index];
      const thumb = card.querySelector(".card-thumbnail");
      if (thumb) thumb.classList.toggle("is-inset-desktop", floatsInFrame(thumb));
    });
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(layout);
  }

  const observer = new ResizeObserver(schedule);
  observer.observe(grid);
  cards.forEach((card) => observer.observe(card));
  desktop.addEventListener("change", schedule);
  grid.addEventListener("load", schedule, true);
  document.fonts?.ready.then(schedule);
  layout();
})();
