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

  // Before first paint: unlock warm revisits (paired with html.hub-warm CSS).
  // Skip on hard refresh so a deliberate reload still gets the intro.
  if (isWarm() && !isReload()) {
    document.documentElement.classList.add("hub-warm");
  }

  const LISTING_PAIR = {
    "index.html": "intern.html",
    "intern.html": "index.html",
  };

  function otherListing() {
    return LISTING_PAIR[pageId()] || null;
  }

  function prefersLiteData() {
    const conn = navigator.connection;
    if (conn?.saveData) return true;
    const type = conn?.effectiveType;
    return type === "slow-2g" || type === "2g";
  }

  const VIDEO_RE = /\.(mp4|mov|m4v|webm)(\?|#|$)/i;

  function collectMediaUrls(html, baseHref) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const urls = new Set();

    // One URL, taken as-is (paths here may contain spaces)
    const add = (raw) => {
      const token = raw?.trim();
      if (!token || token.startsWith("data:")) return;
      try {
        const href = new URL(token, baseHref).href;
        // Listing videos are far too heavy to pull speculatively
        if (!VIDEO_RE.test(href)) urls.add(href);
      } catch {
        /* ignore */
      }
    };

    // Comma-separated candidates, each "url [descriptor]"
    const addSrcset = (raw) => {
      if (!raw) return;
      raw.split(",").forEach((part) => add(part.trim().split(/\s+/)[0]));
    };

    doc.querySelectorAll("img, picture source, [data-src]").forEach((el) => {
      if (el.tagName === "VIDEO" || el.closest("video")) return;
      add(el.getAttribute("src"));
      add(el.getAttribute("data-src"));
      addSrcset(el.getAttribute("srcset"));
    });

    // CSS backgrounds tied to this listing's card modifiers (e.g. .card-dino)
    const cardMods = new Set();
    doc.querySelectorAll(".card").forEach((el) => {
      el.classList.forEach((name) => {
        if (name.startsWith("card-")) cardMods.add(name);
      });
    });
    const cardModRe = cardMods.size
      ? new RegExp(
          `[.](?:${[...cardMods].map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\w-])`
        )
      : null;
    if (cardModRe) {
      for (const sheet of document.styleSheets) {
        let rules;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        for (const rule of rules) {
          const image = rule.style?.backgroundImage;
          if (!rule.selectorText || !image || image === "none") continue;
          if (!cardModRe.test(rule.selectorText)) continue;
          const found = image.match(/url\((['"]?)(.*?)\1\)/g) || [];
          found.forEach((chunk) => {
            const inner = chunk.replace(/^url\((['"]?)(.*?)\1\)$/, "$2");
            add(inner);
          });
        }
      }
    }

    return [...urls];
  }

  // Speculative work is capped so a background warm-up never competes with
  // the visit the user is actually having.
  const WARM_BUDGET_BYTES = 6 * 1024 * 1024;
  const WARM_MAX_FILE_BYTES = 3 * 1024 * 1024;

  function warmFetch(url) {
    return fetch(url, {
      credentials: "same-origin",
      cache: "force-cache",
      priority: "low",
    }).catch(() => null);
  }

  async function sizeOf(url) {
    try {
      const res = await fetch(url, { method: "HEAD", priority: "low" });
      if (!res.ok) return null;
      const len = Number(res.headers.get("content-length"));
      return Number.isFinite(len) && len > 0 ? len : null;
    } catch {
      return null;
    }
  }

  function prerenderUrl(url) {
    if (!HTMLScriptElement.supports?.("speculationrules")) return;
    const el = document.createElement("script");
    el.type = "speculationrules";
    el.textContent = JSON.stringify({
      prerender: [{ source: "list", urls: [url] }],
    });
    document.head.appendChild(el);
  }

  async function warmCache(href) {
    const res = await warmFetch(href);
    if (!res?.ok) return;

    const media = collectMediaUrls(await res.text(), href);
    const onThisPage = new Set(
      [...document.querySelectorAll("img")]
        .map((el) => el.currentSrc || el.src)
        .filter(Boolean)
    );

    let spent = 0;
    for (const url of media) {
      if (onThisPage.has(url)) continue;
      const size = await sizeOf(url);
      if (size && size > WARM_MAX_FILE_BYTES) continue;
      if (spent + (size || 0) > WARM_BUDGET_BYTES) break;
      await warmFetch(url);
      spent += size || 0;
    }
  }

  function prefetchListing(id) {
    if (!id || isWarm(id) || prefersLiteData()) return;
    if (document.prerendering) return;

    const href = new URL(id, location.href).href;
    // Chrome can hand over an already-rendered page; the cache warm-up keeps
    // the plain navigation fast everywhere else (and if prerender is dropped).
    prerenderUrl(href);
    warmCache(href);
  }

  function whenListingIdle(fn) {
    const run = () => {
      const idle = window.requestIdleCallback
        ? (cb) => window.requestIdleCallback(cb, { timeout: 2500 })
        : (cb) => window.setTimeout(cb, 400);
      idle(fn);
    };

    window.addEventListener("page-loader:hidden", run, { once: true });
  }

  if (otherListing()) whenListingIdle(() => prefetchListing(otherListing()));

  global.NCWeiHub = {
    WARM_KEY,
    ABOUT_FLIP_KEY,
    pageId,
    isWarm,
    markWarm,
    isHub,
    isReload,
    otherListing,
    prefetchListing,
  };
})(window);
