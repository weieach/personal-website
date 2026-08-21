/**
 * Hub pages (index / intern / about): remember warm visits in this tab
 * so revisits skip the cold-start loader and entrance choreography.
 * Hard refresh still gets a full cold start.
 */
(function (global) {
  const WARM_KEY = "ncwei:hub-warm";
  const ABOUT_FLIP_KEY = "ncwei:about-flipped";
  const HUBS = new Set(["index.html", "intern.html", "about.html"]);

  function pageId() {
    const file = location.pathname.split("/").pop() || "index.html";
    if (!file || file === "/") return "index.html";
    return file;
  }

  function isReload() {
    const nav = performance.getEntriesByType?.("navigation")?.[0];
    if (nav) return nav.type === "reload";
    // Legacy fallback
    return performance.navigation?.type === 1;
  }

  function readWarm() {
    try {
      return JSON.parse(sessionStorage.getItem(WARM_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function isWarm(id) {
    return Boolean(readWarm()[id || pageId()]);
  }

  function markWarm(id) {
    const key = id || pageId();
    if (!HUBS.has(key)) return;
    const warm = readWarm();
    if (warm[key]) {
      document.documentElement.classList.add("hub-warm");
      return;
    }
    warm[key] = true;
    try {
      sessionStorage.setItem(WARM_KEY, JSON.stringify(warm));
    } catch {
      /* private mode / quota */
    }
    document.documentElement.classList.add("hub-warm");
  }

  function isHub() {
    return HUBS.has(pageId());
  }

  // Before first paint: unlock warm revisits (paired with html.hub-warm CSS).
  // Skip on hard refresh so a deliberate reload still gets the intro.
  if (isWarm() && !isReload()) {
    document.documentElement.classList.add("hub-warm");
  }

  global.NCWeiHub = {
    WARM_KEY,
    ABOUT_FLIP_KEY,
    pageId,
    isWarm,
    markWarm,
    isHub,
    isReload,
  };
})(window);
