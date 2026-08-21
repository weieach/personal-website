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

  function collectMediaUrls(html, baseHref) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const urls = new Set();
    const add = (raw) => {
      if (!raw) return;
      String(raw)
        .split(",")
        .forEach((part) => {
          const token = part.trim().split(/\s+/)[0];
          if (!token || token.startsWith("data:")) return;
          try {
            urls.add(new URL(token, baseHref).href);
          } catch {
            /* ignore */
          }
        });
    };

    doc
      .querySelectorAll("img, video, source, [data-src]")
      .forEach((el) => {
        add(el.getAttribute("src"));
        add(el.getAttribute("data-src"));
        add(el.getAttribute("srcset"));
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

  function warmFetch(url) {
    return fetch(url, {
      credentials: "same-origin",
      cache: "force-cache",
      priority: "low",
    }).catch(() => null);
  }

  function prerenderUrl(url) {
    if (!HTMLScriptElement.supports?.("speculationrules")) return false;
    const el = document.createElement("script");
    el.type = "speculationrules";
    el.textContent = JSON.stringify({
      prerender: [{ source: "list", urls: [url] }],
    });
    document.head.appendChild(el);
    return true;
  }

  function prefetchListing(id) {
    if (!id || isWarm(id) || prefersLiteData()) return;
    if (document.prerendering) return;

    const href = new URL(id, location.href).href;
    if (prerenderUrl(href)) return;

    warmFetch(href).then(async (res) => {
      if (!res?.ok) return;
      const html = await res.text();
      const media = collectMediaUrls(html, href);
      const already = new Set(
        [...document.querySelectorAll("img[src], video[src], source[src]")]
          .map((el) => el.currentSrc || el.src)
          .filter(Boolean)
      );
      for (const url of media) {
        if (already.has(url)) continue;
        await warmFetch(url);
      }
    });
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
