// Project-grid debug mode: reorder cards by dragging or with the hover arrows.
// The new order is kept as a draft (tools/dev-server.py writes it to
// .dev-order.json) and survives refreshes; a coding agent applies it to the
// HTML when asked to close debug mode (tools/dev_order.py apply).
// There is no visible toggle; flip this flag in code to turn the mode on/off.
const DEV_MODE = false;

(() => {
  if (!DEV_MODE) return;
  const grid = document.querySelector("[data-project-grid]");
  const nav = document.querySelector("header nav");
  if (!grid || !nav) return;

  const pageFile = decodeURIComponent(location.pathname.split("/").pop() || "index.html");
  const storePrefix = "ncwei:dev-order:";
  const storeKey = storePrefix + pageFile;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cardsOf = () => [...grid.querySelectorAll(":scope > .card")];
  const visible = (card) => !card.hidden && card.offsetParent !== null;
  // Card identity in the source file: its card-* classes plus the collection.
  // tools/dev_order.py builds the same key from each card's opening tag.
  const keyOf = (card) => [card.dataset.collection || "",
    ...[...card.classList].filter((name) => /^card-/.test(name)).sort()].join(" ");

  document.documentElement.classList.add("dev-mode");
  // devIndex is the card's position in the HTML file, i.e. the saved order.
  cardsOf().forEach((card, index) => {
    card.dataset.devIndex = String(index);
    card.dataset.devKey = keyOf(card);
    card.classList.add("scroll-reveal-card--done");
  });
  grid.querySelectorAll("a, img, video").forEach((el) => el.setAttribute("draggable", "false"));

  const toast = (message) => (window.showToast ? window.showToast(message) : console.info(message));
  const isDirty = () => cardsOf().some((card, index) => card.dataset.devIndex !== String(index));

  // --------------------------
  // Draft order: restored on load, stored after every move
  // --------------------------
  // Draft keys fill the slots of the cards they name; cards missing from the
  // draft (e.g. newly added projects) keep their place.
  function applyOrder(keys) {
    const cards = cardsOf();
    const byKey = new Map(cards.map((card) => [card.dataset.devKey, card]));
    const ordered = [...new Set(keys.map((key) => byKey.get(key)).filter(Boolean))];
    const listed = new Set(ordered);
    cards.map((card) => (listed.has(card) ? ordered.shift() : card))
      .forEach((card) => grid.appendChild(card));
  }

  const readLocalDraft = () => {
    try { return JSON.parse(localStorage.getItem(storeKey)); } catch { return null; }
  };
  const localDraft = readLocalDraft();
  if (Array.isArray(localDraft)) applyOrder(localDraft);

  const serverReady = fetch("/__dev/ping", { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : null))
    .then((body) => body?.ok === true)
    .catch(() => false);

  // The server's draft is what the agent applies, so it wins over this browser's copy.
  serverReady.then(async (server) => {
    if (!server) {
      try {
        if (sessionStorage.getItem("ncwei:dev-server-hint")) return;
        sessionStorage.setItem("ncwei:dev-server-hint", "1");
      } catch {}
      toast("Debug mode: run tools/dev-server.py so the agent can apply this order.");
      return;
    }
    const drafts = await fetch("/__dev/order", { cache: "no-store" }).then((r) => r.json()).catch(() => ({}));
    const keys = drafts[pageFile];
    if (Array.isArray(keys)) {
      applyOrder(keys);
      syncArrows();
    } else if (Array.isArray(localDraft)) {
      persistNow();
    }
  });

  function persistNow() {
    const order = isDirty() ? cardsOf().map((card) => card.dataset.devKey) : null;
    try {
      if (order) localStorage.setItem(storeKey, JSON.stringify(order));
      else localStorage.removeItem(storeKey);
    } catch {}
    serverReady.then((server) => {
      if (!server) return;
      fetch("/__dev/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: pageFile, order }),
      }).catch(() => toast("Could not store the draft order on the dev server."));
    });
  }

  let persistTimer = 0;
  const persist = () => {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persistNow, 250);
  };

  // --------------------------
  // Header "Cancel & leave": drop the draft and turn debug mode off
  // --------------------------
  const leaveItem = document.createElement("li");
  leaveItem.className = "dev-leave-item";
  const leaveButton = document.createElement("button");
  leaveButton.type = "button";
  leaveButton.className = "dev-leave-btn";
  leaveButton.textContent = "Cancel & leave";
  leaveItem.appendChild(leaveButton);
  (nav.querySelector("ul") || nav).appendChild(leaveItem);

  leaveButton.addEventListener("click", async () => {
    if (isDirty() && !confirm("Discard the new project order and leave debug mode?")) return;
    clearTimeout(persistTimer);
    try {
      Object.keys(localStorage).filter((key) => key.startsWith(storePrefix))
        .forEach((key) => localStorage.removeItem(key));
    } catch {}
    if (await serverReady) {
      const response = await fetch("/__dev/leave", { method: "POST" }).catch(() => null);
      if (response?.ok) { location.reload(); return; }
    }
    // Without the dev server the flag can't be flipped from here.
    applyOrder([...cardsOf()].sort((a, b) => a.dataset.devIndex - b.dataset.devIndex)
      .map((card) => card.dataset.devKey));
    syncArrows();
    toast("Order reset. Ask the agent to turn debug mode off.");
  });

  // --------------------------
  // Reordering with FLIP so surrounding cards glide to their new slots
  // --------------------------
  function reorder(mutate, skip) {
    const cards = cardsOf().filter((card) => card !== skip && visible(card));
    const before = new Map(cards.map((card) => [card, card.getBoundingClientRect()]));
    mutate();
    cards.forEach((card) => {
      card.getAnimations().forEach((animation) => {
        if (animation.id === "dev-flip") animation.cancel();
      });
      if (reduceMotion) return;
      const from = before.get(card);
      const to = card.getBoundingClientRect();
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (!dx && !dy) return;
      card.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
        { duration: 260, easing: "cubic-bezier(0.22, 1, 0.36, 1)", id: "dev-flip" }
      );
    });
    persist();
  }

  // Step past cards hidden by the active filter so every move is visible.
  function neighbor(card, step) {
    let next = step < 0 ? card.previousElementSibling : card.nextElementSibling;
    while (next && !(next.matches(".card") && visible(next))) {
      next = step < 0 ? next.previousElementSibling : next.nextElementSibling;
    }
    return next;
  }

  function move(card, step) {
    const target = neighbor(card, step);
    if (!target) return;
    reorder(() => (step < 0 ? target.before(card) : target.after(card)));
  }

  // --------------------------
  // Hover arrows centered in each thumbnail
  // --------------------------
  function syncArrows() {
    cardsOf().forEach((card) => {
      card.querySelector(".dev-order-prev")?.toggleAttribute("disabled", !neighbor(card, -1));
      card.querySelector(".dev-order-next")?.toggleAttribute("disabled", !neighbor(card, 1));
    });
  }

  cardsOf().forEach((card) => {
    const thumb = card.querySelector(".card-thumbnail");
    if (!thumb) return;
    const controls = document.createElement("div");
    controls.className = "dev-order-controls";
    [["prev", -1, "left", "Move earlier"], ["next", 1, "right", "Move later"]].forEach(([name, step, icon, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `dev-order-btn dev-order-${name}`;
      button.setAttribute("aria-label", label);
      button.innerHTML = `<i class="ph-bold ph-arrow-${icon}" aria-hidden="true"></i>`;
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        move(card, step);
        syncArrows();
        button.focus({ preventScroll: true });
      });
      controls.appendChild(button);
    });
    thumb.appendChild(controls);
  });
  syncArrows();
  window.addEventListener("project-filters:selected", syncArrows);

  // --------------------------
  // Thumbnails don't open project pages; chips (details, visit site) still work.
  // --------------------------
  let suppressClick = false;
  document.addEventListener("click", (event) => {
    const card = event.target.closest?.("[data-project-grid] > .card");
    if (!card) return;
    if (suppressClick) {
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const link = event.target.closest("a");
    if (link && !link.matches(".btn-project-details, .btn-visit-site")) event.preventDefault();
  }, true);

  // --------------------------
  // Pointer dragging: the card follows the cursor while the grid reflows around it.
  // --------------------------
  const DRAG_THRESHOLD = 6;
  const EDGE = 80;
  let drag = null;

  const pageOffset = (card) => ({ x: card.offsetLeft, y: card.offsetTop });

  function placeDragged() {
    const { card, startPointer, startOffset, pointer } = drag;
    const now = pageOffset(card);
    const x = startOffset.x + (pointer.x + scrollX - startPointer.x) - now.x;
    const y = startOffset.y + (pointer.y + scrollY - startPointer.y) - now.y;
    card.style.transform = `translate(${x}px, ${y}px) scale(1.03)`;
  }

  function hitTest() {
    if (performance.now() < drag.cooldownUntil) return;
    const under = document.elementFromPoint(drag.pointer.x, drag.pointer.y);
    const target = under?.closest("[data-project-grid] > .card");
    if (!target || target === drag.card || !visible(target)) {
      drag.lastTarget = null;
      return;
    }
    if (target === drag.lastTarget) return;
    drag.lastTarget = target;
    const cards = cardsOf();
    const forward = cards.indexOf(drag.card) < cards.indexOf(target);
    reorder(() => (forward ? target.after(drag.card) : target.before(drag.card)), drag.card);
    drag.cooldownUntil = performance.now() + (reduceMotion ? 0 : 200);
    placeDragged();
  }

  function autoScroll() {
    if (!drag?.active) return;
    const { y } = drag.pointer;
    const speed = y < EDGE ? -(EDGE - y) / 4 : y > innerHeight - EDGE ? (y - innerHeight + EDGE) / 4 : 0;
    if (speed) {
      scrollBy(0, speed);
      placeDragged();
      hitTest();
    }
    drag.frame = requestAnimationFrame(autoScroll);
  }

  function startDrag() {
    const { card } = drag;
    drag.active = true;
    card.getAnimations().forEach((animation) => animation.cancel());
    card.classList.add("is-dev-dragging");
    document.documentElement.classList.add("is-dev-dragging-any");
    placeDragged();
    drag.frame = requestAnimationFrame(autoScroll);
  }

  function endDrag() {
    if (!drag) return;
    const { card, active, frame } = drag;
    cancelAnimationFrame(frame);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
    drag = null;
    if (!active) return;
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    // Settle from the floating position into the card's final slot.
    const from = card.style.transform;
    card.classList.remove("is-dev-dragging");
    document.documentElement.classList.remove("is-dev-dragging-any");
    card.style.transform = "";
    if (!reduceMotion && from) {
      card.animate([{ transform: from }, { transform: "none" }],
        { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)", id: "dev-flip" });
    }
    syncArrows();
    persist();
  }

  function onPointerMove(event) {
    drag.pointer = { x: event.clientX, y: event.clientY };
    if (!drag.active) {
      const dx = event.clientX + scrollX - drag.startPointer.x;
      const dy = event.clientY + scrollY - drag.startPointer.y;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      startDrag();
    }
    event.preventDefault();
    placeDragged();
    hitTest();
  }

  grid.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.pointerType === "touch" || drag) return;
    const card = event.target.closest("[data-project-grid] > .card");
    if (!card || event.target.closest("button, .btn-visit-site, .thumbnail-cta")) return;
    event.preventDefault();
    drag = {
      card,
      active: false,
      startPointer: { x: event.clientX + scrollX, y: event.clientY + scrollY },
      startOffset: pageOffset(card),
      pointer: { x: event.clientX, y: event.clientY },
      lastTarget: null,
      cooldownUntil: 0,
      frame: 0,
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
  });
})();
