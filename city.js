/* Yat's List · city routing (深圳 /szevents/ ↔ 香港 /hkevents/).
   Loaded by / (index.html) and by both city pages, after /shell.js.
   window.YLCity.detect({timeout}) -> Promise<{city: "sz"|"hk", source: "stored"|"trace"|"fallback"}>
     1. stored preference localStorage "szCity" (set when the user clicks the 深圳 | 香港 switch or answers the suggestion bar)
     2. Cloudflare /cdn-cgi/trace (same origin, text, "loc=XX"): HK or MO -> hk, any other country -> sz
     3. trace failed / timed out: time zone Asia/Hong_Kong or Asia/Macau, or navigator.language zh-HK / zh-MO -> hk; else sz
   On a city page (<nav class="cityswitch" data-page-city="sz|hk">):
     - labels the switch in YL.lang, keeps ?lang= on its links, stores szCity on click
     - first city page of the session, no szCity yet, detection != this page: shows a dismissible bar pointing to the other city
       (dismiss stores this page's city, following the link stores the other one). Pages are never redirected. */
(function () {
  "use strict";
  if (window.YLCity) return;
  var d = document, KEY = "szCity", GEO = "szGeo", SEEN = "szCitySeen";
  var PAGES = { sz: "/szevents/", hk: "/hkevents/" };
  function norm(c) { return c === "hk" || c === "sz" ? c : ""; }
  function stored() { try { return norm(localStorage.getItem(KEY)); } catch (e) { return ""; } }
  function store(c) { c = norm(c); if (c) try { localStorage.setItem(KEY, c); } catch (e) {} }
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) {} return null; }

  function fallback() {
    var tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
    if (tz === "Asia/Hong_Kong" || tz === "Asia/Macau") return "hk";
    var nl = String(navigator.language || "").toLowerCase();
    return nl === "zh-hk" || nl === "zh-mo" ? "hk" : "sz";
  }
  // Resolves with the two-letter country from Cloudflare's trace, or "" (no Cloudflare, error, timeout)
  function trace(ms) {
    var cached = ss(GEO);
    if (cached !== null && cached !== undefined) return Promise.resolve(cached);
    return new Promise(function (resolve) {
      var done = false, ctl = window.AbortController ? new AbortController() : null;
      function finish(loc) { if (done) return; done = true; clearTimeout(t); if (loc) ss(GEO, loc); resolve(loc); }
      var t = setTimeout(function () { if (ctl) try { ctl.abort(); } catch (e) {} finish(""); }, ms);
      try {
        fetch("/cdn-cgi/trace", { cache: "no-store", credentials: "omit", signal: ctl ? ctl.signal : undefined })
          .then(function (r) { return r.ok ? r.text() : ""; })
          .then(function (txt) { var m = /(?:^|\n)loc=([A-Z]{2})\s*(?:\n|$)/.exec(txt || ""); finish(m ? m[1] : ""); })
          .catch(function () { finish(""); });
      } catch (e) { finish(""); }
    });
  }
  function detect(opts) {
    opts = opts || {};
    var s = opts.ignoreStored ? "" : stored();
    if (s) return Promise.resolve({ city: s, source: "stored" });
    return trace(opts.timeout || 800).then(function (loc) {
      if (loc) return { city: loc === "HK" || loc === "MO" ? "hk" : "sz", source: "trace", loc: loc };
      return { city: fallback(), source: "fallback" };
    });
  }
  window.YLCity = { detect: detect, stored: stored, store: store, pages: PAGES };

  /* ---------- city page UI ---------- */
  var T = {
    zh: { nav: "城市", sz: "深圳", hk: "香港", close: "关闭",
      hkMsg: "看起来你在香港", hkGo: "看香港活动 →", szMsg: "你可能更想看深圳活动", szGo: "看深圳活动 →" },
    tw: { nav: "城市", sz: "深圳", hk: "香港", close: "關閉",
      hkMsg: "看起來你在香港", hkGo: "看香港活動 →", szMsg: "你可能更想看深圳活動", szGo: "看深圳活動 →" },
    en: { nav: "City", sz: "Shenzhen", hk: "Hong Kong", close: "Close",
      hkMsg: "Looks like you're in Hong Kong", hkGo: "See Hong Kong events →", szMsg: "You might be looking for Shenzhen events", szGo: "See Shenzhen events →" }
  };
  function lang() { var l = window.YL && YL.lang; return l === "en" || l === "tw" ? l : "zh"; }
  function href(c) {
    var q = null; try { q = new URLSearchParams(location.search).get("lang"); } catch (e) {}
    return PAGES[c] + (q ? "?lang=" + encodeURIComponent(q) : "");
  }
  /* .cityswitch styles live in /events.css, linked in each city page's <head> (no flash before this deferred script runs); only the bar is styled here */
  var css =
    ".yl-citybar{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin:0 0 14px;padding:9px 12px 9px 16px;border:1px solid var(--border);border-radius:12px;background:var(--panel);font-size:.88rem;color:var(--ink-sec)}" +
    ".yl-citybar[hidden]{display:none}.yl-citybar .m{flex:1;min-width:0}.yl-citybar a{color:var(--green);font-weight:700;text-decoration:none;white-space:nowrap}" +
    ".yl-citybar button{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;min-width:40px;min-height:40px;margin:-6px -6px -6px 0;background:none;border:0;border-radius:8px;color:var(--ink-ter);font:inherit;font-size:1rem;line-height:1;padding:0;cursor:pointer}.yl-citybar button:hover{color:var(--ink)}";

  function initPage() {
    var nav = d.querySelector("nav.cityswitch[data-page-city]");
    if (!nav) return;
    var page = norm(nav.getAttribute("data-page-city")) || "sz", other = page === "hk" ? "sz" : "hk";
    var st = d.createElement("style"); st.id = "yl-city-css"; st.textContent = css; (d.head || d.documentElement).appendChild(st);
    var bar = null;
    function paint() {
      var t = T[lang()];
      nav.setAttribute("aria-label", t.nav);
      Array.prototype.forEach.call(nav.querySelectorAll("a[data-city]"), function (a) {
        var c = a.getAttribute("data-city"), on = c === page;
        a.textContent = t[c]; a.href = href(c); a.classList.toggle("on", on);
        if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
      });
      if (bar) {
        bar.querySelector(".m").textContent = t[other + "Msg"];
        var go = bar.querySelector("a"); go.textContent = t[other + "Go"]; go.href = href(other);
        var x = bar.querySelector("button"); x.setAttribute("aria-label", t.close); x.title = t.close;
      }
    }
    nav.addEventListener("click", function (e) { var a = e.target.closest && e.target.closest("a[data-city]"); if (a) store(a.getAttribute("data-city")); });
    if (window.YL && YL.onLang) YL.onLang(function () { setTimeout(paint, 0); });
    paint();

    var firstOfSession = !ss(SEEN);
    ss(SEEN, "1");
    if (!firstOfSession || stored()) return;
    detect({ ignoreStored: true }).then(function (r) {
      if (r.city === page || stored()) return;
      bar = d.createElement("div"); bar.className = "yl-citybar"; bar.id = "yl-citybar"; bar.setAttribute("role", "note");
      bar.innerHTML = '<span class="m"></span><a></a><button type="button">✕</button>';
      bar.querySelector("a").addEventListener("click", function () { store(other); });
      bar.querySelector("button").addEventListener("click", function () { store(page); bar.hidden = true; });
      var wrap = d.querySelector(".human-section > .wrap") || d.body;
      wrap.insertBefore(bar, wrap.firstChild);
      paint();
    });
  }
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", initPage); else initPage();
})();
