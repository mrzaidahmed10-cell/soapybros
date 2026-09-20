// Shared site-wide behavior: menu drawer, search, scroll reveals, active nav
// state, and smooth page-to-page transitions. Runs on every page.
(function () {
  const pages = [
    { title: "Home", url: "index.html", description: "Mobile detailing in Iowa City, Coralville, and North Liberty." },
    { title: "About", url: "about.html", description: "Three high schoolers bringing the full detail to your driveway." },
    { title: "Pricing", url: "pricing.html", description: "Final price confirmed once we arrive." },
    { title: "Book", url: "book.html", description: "Choose a date and time and request your detail." },
    { title: "Reviews", url: "reviews.html", description: "Hear from local customers and Google review highlights." },
    { title: "Contact", url: "contact.html", description: "Call, text, or email Soapy Bros." }
  ];

  function currentPage() {
    const path = window.location.pathname;
    if (path === "" || path === "/") return "index.html";
    const segments = path.split("/").filter(Boolean);
    let seg = segments.length ? segments[segments.length - 1] : "";
    if (!seg) return "index.html";
    // Hosts like Netlify can serve clean URLs (e.g. "/book" instead of
    // "/book.html") — normalize so it still matches our href="book.html" links.
    if (seg.indexOf(".") === -1) seg += ".html";
    return seg;
  }

  // ---------- Active nav link state ----------
  // Runs independently of the drawer/search so it always works, even if
  // those features are hidden or fail to initialize on a given page.
  function initActiveLinks() {
    const cur = currentPage();
    document.querySelectorAll('.menu-drawer-links a[href], .nav-links a[href]').forEach(function (a) {
      const href = a.getAttribute("href");
      if (href === cur) {
        a.classList.add("active");
      } else {
        a.classList.remove("active");
      }
    });
  }

  function initDrawer() {
    const trigger = document.getElementById("menuTrigger");
    const drawer = document.getElementById("menuDrawer");
    const overlay = document.getElementById("menuOverlay");
    const closeBtn = document.getElementById("menuClose");
    if (!trigger || !drawer || !overlay) return;

    function open() {
      drawer.classList.add("open");
      overlay.classList.add("open");
      trigger.setAttribute("aria-expanded", "true");
    }
    function close() {
      drawer.classList.remove("open");
      overlay.classList.remove("open");
      trigger.setAttribute("aria-expanded", "false");
    }

    trigger.addEventListener("click", function () {
      drawer.classList.contains("open") ? close() : open();
    });
    overlay.addEventListener("click", close);
    if (closeBtn) closeBtn.addEventListener("click", close);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });
  }

  function initSearch() {
    const trigger = document.getElementById("searchTrigger");
    const popover = document.getElementById("searchPopover");
    const input = document.getElementById("siteSearchInput");
    const results = document.getElementById("searchResults");
    const wrap = document.getElementById("searchWrap");
    if (!trigger || !popover || !input || !results || !wrap) return;

    function openPopover() {
      popover.classList.add("open");
      input.focus();
    }
    function closePopover() {
      popover.classList.remove("open");
    }

    trigger.addEventListener("click", function () {
      popover.classList.contains("open") ? closePopover() : openPopover();
    });

    function render(list) {
      results.innerHTML = "";
      if (list.length === 0) {
        results.innerHTML = '<div class="search-empty">No pages match that search.</div>';
        results.classList.add("open");
        return;
      }
      list.forEach(function (p) {
        const a = document.createElement("a");
        a.href = p.url;
        a.className = "search-result";
        a.innerHTML = '<span class="search-result-title">' + p.title + '</span><span class="search-result-desc">' + p.description + '</span>';
        results.appendChild(a);
      });
      results.classList.add("open");
    }

    input.addEventListener("input", function () {
      const q = input.value.trim().toLowerCase();
      if (q === "") { results.classList.remove("open"); return; }
      if (q === "!devportal") { window.location.href = "dev-portal.html"; return; }
      const matches = pages.filter(function (p) {
        return p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
      });
      render(matches);
    });

    input.addEventListener("focus", function () {
      if (input.value.trim() !== "") results.classList.add("open");
    });

    document.addEventListener("click", function (e) {
      if (!wrap.contains(e.target)) { results.classList.remove("open"); closePopover(); }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closePopover();
    });

    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        const first = results.querySelector(".search-result");
        if (first) window.location.href = first.getAttribute("href");
      }
    });
  }

  function initReveals() {
    const items = document.querySelectorAll('.reveal');
    if (items.length === 0) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      items.forEach(function (el) { el.classList.add('revealed'); });
      return;
    }

    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    items.forEach(function (el) { observer.observe(el); });
  }

  // ---------- Smooth page-to-page transitions ----------
  // Intercepts clicks on same-site page links, plays a quick fade/blur
  // out, then navigates. Pairs with a fade/blur-in on load (see CSS).
  function initPageTransitions() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const localPages = pages.map(function (p) { return p.url; }).concat(["services.html", "area.html", "process.html"]);

    document.body.classList.add("page-enter");
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        document.body.classList.add("page-enter-active");
      });
    });

    document.addEventListener("click", function (e) {
      const link = e.target.closest("a[href]");
      if (!link) return;
      if (link.target === "_blank" || link.hasAttribute("download")) return;

      const href = link.getAttribute("href");
      if (!href || href.indexOf("#") === 0) return;
      if (href.indexOf(":") !== -1 && href.indexOf("://") === -1 && href.indexOf("tel:") !== 0 && href.indexOf("mailto:") !== 0) return;
      if (href.indexOf("http") === 0 || href.indexOf("tel:") === 0 || href.indexOf("mailto:") === 0) return;

      const cleanHref = href.split("?")[0].split("#")[0];
      if (localPages.indexOf(cleanHref) === -1) return;

      e.preventDefault();
      document.body.classList.add("page-exit");
      setTimeout(function () {
        window.location.href = href;
      }, 260);
    });
  }

  // ---------- Analytics beacon + site config ----------
  // Shared with book.html's Apps Script Web App.
  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby90m4IQJhWy7z5Kw3shswafCO1HoFDO_2JradATRSS5F9nUiYGRIHvDXzaWBClXUvR/exec';
  const HEARTBEAT_INTERVAL_MS = 45000;

  function getSessionId() {
    let id = sessionStorage.getItem('sbSessionId');
    if (!id) {
      id = 'sb-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
      sessionStorage.setItem('sbSessionId', id);
    }
    return id;
  }

  function initAnalytics() {
    // Don't track the admin's own visits to the dev portal.
    if (currentPage() === 'dev-portal.html') return;

    const session = getSessionId();
    const page = currentPage();

    function ping(action) {
      const body = new URLSearchParams({ action: action, page: page, session: session });
      fetch(APPS_SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: body })
        .catch(function () { /* best-effort, ignore failures */ });
    }

    ping('pageview');
    setInterval(function () {
      if (document.visibilityState === 'visible') ping('heartbeat');
    }, HEARTBEAT_INTERVAL_MS);
  }

  // Fetches the public site config (booking open/closed, banner message) and
  // fires a "sbconfig" event with the result — pages listen for it to react.
  function initSiteConfig() {
    fetch(APPS_SCRIPT_URL + '?action=config')
      .then(function (res) { return res.json(); })
      .then(function (config) {
        document.dispatchEvent(new CustomEvent('sbconfig', { detail: config }));
      })
      .catch(function () { /* if this fails, pages just show their normal default state */ });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initActiveLinks();
    initDrawer();
    initSearch();
    initReveals();
    initPageTransitions();
    initAnalytics();
    initSiteConfig();
  });
})();
