/**
 * Hub pages (work / about): remember warm visits in this tab
 * so revisits skip the cold-start loader and entrance choreography.
 * Hard refresh still gets a full cold start.
 */
(function (global) {
  const WARM_KEY = "ncwei:hub-warm";
  const ABOUT_FLIP_KEY = "ncwei:about-flipped";
  const ABOUT_VISITED_KEY = "ncwei:about-visited";
  const HUBS = new Set(["work.html", "archive.html", "about.html"]);

  function pageId() {
    const file = location.pathname.split("/").pop() || "work.html";
    if (!file || file === "/") return "work.html";
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

    // A prerendered page hasn't been seen yet; only count it once activated,
    // otherwise a discarded prerender would suppress the real visit's intro.
    if (document.prerendering) {
      document.addEventListener("prerenderingchange", () => markWarm(key), {
        once: true,
      });
      return;
    }

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

  function hasVisitedAbout() {
    try {
      return sessionStorage.getItem(ABOUT_VISITED_KEY) === "1";
    } catch {
      return false;
    }
  }

  function markAboutVisited() {
    try {
      sessionStorage.setItem(ABOUT_VISITED_KEY, "1");
    } catch {
      /* private mode / quota */
    }
  }

  // Before first paint: unlock warm revisits (paired with html.hub-warm CSS).
  // Skip on hard refresh so a deliberate reload still gets the intro.
  if (isWarm() && !isReload()) {
    document.documentElement.classList.add("hub-warm");
  }

  // Archive stays out of the nav until About's entrance has run in this tab.
  if (!hasVisitedAbout()) {
    document.documentElement.classList.add("archive-locked");
  }

  global.NCWeiHub = {
    WARM_KEY,
    ABOUT_FLIP_KEY,
    ABOUT_VISITED_KEY,
    pageId,
    isWarm,
    markWarm,
    hasVisitedAbout,
    markAboutVisited,
    isHub,
    isReload,
  };
})(window);
