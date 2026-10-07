(() => {
  const grid = document.querySelector("[data-project-grid]");
  if (!grid || !window.ResizeObserver) return;

  const cards = [...grid.querySelectorAll(":scope > .card")];
  const desktop = window.matchMedia("(min-width: 960px)");
  let frame = 0;

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
    });
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(layout);
  }

  const observer = new ResizeObserver(schedule);
  observer.observe(grid);
  cards.forEach((card) => observer.observe(card));
  desktop.addEventListener("change", schedule);
  document.fonts?.ready.then(schedule);
  layout();
})();
