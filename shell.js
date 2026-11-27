/* Yat's List · shared site shell (topbar, language select, theme toggle).
   Usage, placed where the topbar goes (synchronous, not defer):
     <div id="yl-topbar" data-active="tglist"></div><script src="/shell.js?v=2"></script>
   Placeholder attributes:
     data-active     nav key to highlight: szevents hackathons talks tglist xlist vps nomadlist btc quant altruists remote
     data-label      extra highlighted item for pages outside the nav (data-label-tw / data-label-en optional)
     data-i18n="none"  page body is not translated: hide the language select, show the topbar in data-lang (default zh)
     data-lang       fixed page language (e.g. talks/en/)
     data-lang-default  language when there is no ?lang= and no stored szLang (e.g. "tw" on /hk/); not stored
     data-lang-base  with data-lang: switching language navigates to base (zh), base+"tw/", base+"en/"
     data-themes="dark"  page has no light CSS: hide the theme toggle and always render dark
     data-agent      href for the "Agent" link (default "#agentbox" when the page has #agentbox)
   Child elements of the placeholder (e.g. a page's submit button) are moved into the nav, before the prefs.
   API: window.YL = { lang, theme, setLang(l), setTheme(t), onLang(cb), onTheme(cb) }
     onLang(cb(lang)) / onTheme(cb(mode, resolved)) fire on changes only, not on registration.
     The same changes are dispatched on document as CustomEvents "yl:lang" / "yl:theme" (detail: {lang} / {theme, resolved}).
   Storage: localStorage "szLang" (zh / tw / en, ?lang= overrides for the visit) and "szTheme" (auto / light / dark). */
(function () {
  "use strict";
  var d = document, root = d.documentElement;
  var ph = d.getElementById("yl-topbar");
  if (!ph || window.YL) return;
  var cfg = ph.dataset;

  var S = {
    zh: { menu: "☰ 菜单", agent: "Agent", events: "活动", hack: "黑客松", talks: "Talks", lists: "清单",
      tglist: "TG 清单", xlist: "X List", vps: "VPS", nomadlist: "NomadList", btc: "BTC", quant: "量化", altruists: "利他主义者", remote: "远程工作",
      lang: "语言", themeLabel: "主题", theme: { auto: "自动", light: "白天", dark: "晚上" } },
    tw: { menu: "☰ 選單", agent: "Agent", events: "活動", hack: "黑客松", talks: "Talks", lists: "清單",
      tglist: "TG 清單", xlist: "X List", vps: "VPS", nomadlist: "NomadList", btc: "BTC", quant: "量化", altruists: "利他主義者", remote: "遠端工作",
      lang: "語言", themeLabel: "主題", theme: { auto: "自動", light: "白天", dark: "晚上" } },
    en: { menu: "☰ Menu", agent: "Agent", events: "Events", hack: "Hackathons", talks: "Talks", lists: "Lists",
      tglist: "TG List", xlist: "X List", vps: "VPS", nomadlist: "NomadList", btc: "BTC", quant: "Quant", altruists: "The Altruists", remote: "Remote jobs",
      lang: "Language", themeLabel: "Theme", theme: { auto: "Auto", light: "Light", dark: "Dark" } }
  };
  var MAIN = [["szevents", "/szevents/", "events"], ["hackathons", "/hackathons/", "hack"], ["talks", "/talks/", "talks"]];
  var LISTS = [["tglist", "/tglist/"], ["xlist", "/xlist/"], ["vps", "/vps/"], ["nomadlist", "/nomadlist/"], ["btc", "/btc/"],
    ["quant", "/quant/"], ["altruists", "/altruists/"], ["remote", "/remote/"]];

  /* ---------- language: ?lang= > localStorage szLang > browser language ---------- */
  var I18N = cfg.i18n !== "none", FIXED = cfg.lang || "", BASE = cfg.langBase || "", DEF = cfg.langDefault || "";
  function norm(l) { return l === "en" || l === "tw" ? l : "zh"; }
  function detect() {
    var l = "", q = null;
    try { q = new URLSearchParams(location.search).get("lang"); } catch (e) {}
    try { l = q || localStorage.getItem("szLang") || ""; } catch (e) { l = q || ""; }
    if (!l && DEF) l = DEF;
    if (!l) { var nl = ((navigator.language || "zh-CN") + "").toLowerCase(); l = (nl === "zh-tw" || nl === "zh-hk" || nl === "zh-mo" || nl.indexOf("zh-hant") === 0) ? "tw" : nl.indexOf("zh") === 0 ? "zh" : "en"; }
    return norm(l);
  }
  var LANG = FIXED ? norm(FIXED) : I18N ? detect() : "zh";

  /* ---------- theme: auto / light / dark ---------- */
  var DARK_ONLY = cfg.themes === "dark";
  var THEME = "auto";
  try { THEME = localStorage.getItem("szTheme") || "auto"; } catch (e) {}
  if (THEME !== "light" && THEME !== "dark") THEME = "auto";
  var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : { matches: true };
  function resolved() { return DARK_ONLY ? "dark" : THEME === "dark" ? "dark" : THEME === "light" ? "light" : (mq.matches ? "dark" : "light"); }

  /* ---------- CSS (injected once; scoped to #yl-topbar.topbar so page rules can't override it) ---------- */
  var P = "#yl-topbar.topbar";
  var css = [
    P + "{--yl-bar:var(--bar-bg,rgba(13,18,24,.95));--yl-panel:var(--panel,#10151b);--yl-hover:var(--panel-hover,#161d26);--yl-ink:var(--ink,#e6edf3);--yl-ink2:var(--ink-sec,#8b98a5);--yl-ink3:var(--ink-ter,#6a737d);--yl-green:var(--green,#2ee6a8);--yl-border:var(--border,rgba(255,255,255,.08));--yl-border-h:var(--border-hover,rgba(255,255,255,.16));" +
      "--yl-sans:var(--font-sans,-apple-system,BlinkMacSystemFont,\"PingFang SC\",\"Hiragino Sans GB\",\"Microsoft YaHei\",\"Source Han Sans SC\",sans-serif);--yl-mono:var(--font-mono,ui-monospace,\"SF Mono\",Consolas,\"Courier New\",monospace);" +
      "position:sticky;top:0;z-index:100;background:var(--yl-bar);backdrop-filter:blur(16px) saturate(160%);-webkit-backdrop-filter:blur(16px) saturate(160%);border-bottom:1px solid var(--yl-border);padding:clamp(12px,3vw,16px) 0;margin:0;font-family:var(--yl-sans);font-size:16px;line-height:1.65;letter-spacing:.01em;color:var(--yl-ink);text-align:left}",
    ":root[data-theme=\"light\"] " + P + "{--yl-bar:var(--bar-bg,rgba(246,248,247,.92));--yl-panel:var(--panel,#ffffff);--yl-hover:var(--panel-hover,#edf2f0);--yl-ink:var(--ink,#15211c);--yl-ink2:var(--ink-sec,#42534b);--yl-ink3:var(--ink-ter,#67766e);--yl-green:var(--green,#0a7d55);--yl-border:var(--border,rgba(16,42,32,.13));--yl-border-h:var(--border-hover,rgba(16,42,32,.26))}",
    P + " *," + P + " *::before," + P + " *::after{box-sizing:border-box}",
    P + " [hidden]{display:none!important}",
    P + " .wrap{position:relative;max-width:1200px;margin:0 auto;padding:0 clamp(16px,4vw,24px);display:grid;grid-template-columns:auto 1fr;gap:clamp(24px,4vw,32px);align-items:center}",
    P + " a," + P + " a:hover{text-decoration:none}",
    P + " .topbar-brand{display:flex;align-items:center;gap:12px}",
    P + " .brandmark{font-family:var(--yl-mono);font-weight:700;font-size:clamp(1.05rem,3vw,1.3rem);color:var(--yl-ink);white-space:nowrap;line-height:1.25}",
    P + " .brandmark .cur{color:var(--yl-green)}",
    P + " .topbar-nav{display:flex;gap:clamp(16px,3vw,24px);align-items:center;justify-content:flex-end;flex-wrap:wrap;margin:0;padding:0;overflow:visible;width:auto}",
    P + " .topbar-nav a," + P + " .yl-dd-btn{color:var(--yl-ink2);font-size:clamp(.88rem,2vw,.95rem);font-weight:600;transition:color .2s ease;white-space:nowrap}",
    P + " .topbar-nav a:hover," + P + " .topbar-nav a.nav-on," + P + " .yl-dd-btn:hover," + P + " .yl-dd-btn.nav-on{color:var(--yl-green)}",
    P + " .yl-dd{position:relative;display:inline-flex;align-items:center}",
    P + " .yl-dd-btn{appearance:none;-webkit-appearance:none;background:none;border:0;margin:0;padding:0;font-family:inherit;line-height:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:5px}",
    P + " .yl-caret{opacity:.75;transition:transform .15s ease}",
    P + " .yl-dd.open .yl-caret{transform:rotate(180deg)}",
    P + " .yl-dd-head{display:none}",
    P + " .yl-dd-menu{display:none;position:absolute;top:calc(100% + 12px);left:-14px;z-index:140;flex-direction:column;gap:2px;min-width:180px;padding:8px;background:var(--yl-panel);border:1px solid var(--yl-border);border-radius:12px;box-shadow:0 14px 40px rgba(0,0,0,.35)}",
    P + " .yl-dd.open .yl-dd-menu{display:flex}",
    P + " .yl-dd-menu a{display:block;padding:7px 12px;border-radius:8px}",
    P + " .yl-dd-menu a:hover{background:var(--yl-hover)}",
    P + " .prefs{display:inline-flex;align-items:center;gap:6px}",
    P + " .langsel{appearance:none;-webkit-appearance:none;background:transparent url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%238a9a94' stroke-width='1.5'/%3E%3C/svg%3E\") no-repeat right 8px center;border:1px solid var(--yl-border);border-radius:8px;color:var(--yl-ink2);font:inherit;font-size:.82rem;font-weight:600;height:30px;margin:0;padding:0 24px 0 10px;cursor:pointer;line-height:1}",
    P + " .langsel:hover," + P + " .langsel:focus-visible{color:var(--yl-ink);border-color:var(--yl-border-h)}",
    P + " .langsel option{background:var(--yl-panel);color:var(--yl-ink)}",
    P + " .themecyc{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;margin:0;padding:0;background:none;border:1px solid var(--yl-border);border-radius:8px;color:var(--yl-ink2);font:inherit;font-size:.95rem;line-height:1;cursor:pointer}",
    P + " .themecyc:hover," + P + " .themecyc:focus-visible{color:var(--yl-ink);border-color:var(--yl-border-h)}",
    P + " #mnav-btn{display:none}",
    P + " #mnav-panel{display:contents}",
    "@media (max-width:820px){" +
      P + " #mnav-btn{display:inline-flex;align-items:center;gap:6px;background:var(--yl-panel);border:1px solid var(--yl-border);color:var(--yl-ink);border-radius:999px;padding:7px 14px;margin:0;font-family:inherit;font-size:.88rem;font-weight:600;line-height:1.65;cursor:pointer;justify-self:end}" +
      P + " #mnav-panel{display:none;position:absolute;top:calc(100% + 6px);right:10px;z-index:130;background:var(--yl-panel);border:1px solid var(--yl-border);border-radius:14px;box-shadow:0 14px 40px rgba(0,0,0,.35);padding:12px 16px;min-width:210px;max-height:calc(100vh - 90px);overflow-y:auto}" +
      P + " #mnav-panel.open{display:block}" +
      P + " #mnav-panel .topbar-nav{display:flex;flex-direction:column;align-items:flex-start;gap:12px;flex-wrap:nowrap}" +
      P + " #mnav-panel .topbar-nav a{font-size:.95rem}" +
      P + " .yl-dd," + P + " .yl-dd-menu," + P + " .yl-dd.open .yl-dd-menu{display:contents}" +
      P + " .yl-dd-btn{display:none}" +
      P + " .yl-dd-head{display:block;width:100%;padding-top:10px;border-top:1px solid var(--yl-border);color:var(--yl-ink3);font-size:.75rem;font-weight:650;letter-spacing:.08em}" +
      P + " .yl-dd-menu a{padding:0;border-radius:0}" +
      P + " .yl-dd-menu a:hover{background:none}" +
      P + " #mnav-panel .prefs{width:100%;padding-top:12px;margin-top:2px;border-top:1px solid var(--yl-border)}" +
      P + " #mnav-panel .langsel," + P + " #mnav-panel .themecyc{height:34px}" +
      P + " #mnav-panel .themecyc{width:34px}" +
    "}"
  ].join("\n");
  if (!d.getElementById("yl-shell-css")) {
    var st = d.createElement("style"); st.id = "yl-shell-css"; st.textContent = css;
    (d.head || root).appendChild(st);
  }

  /* ---------- markup ---------- */
  /* 暂时只显示 活动 / 黑客松 / Talks；改成 true 恢复 Agent、清单下拉和专题高亮项 */
  var SHOW_EXTRAS = false;
  var ACTIVE = cfg.active || "";
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); }
  function link(key, href, label) {
    var on = key === ACTIVE;
    return "<a href=\"" + href + "\" data-yl=\"" + label + "\"" + (on ? " class=\"nav-on\" aria-current=\"page\"" : "") + ">" + esc(S[LANG][label]) + "</a>";
  }
  var listOn = LISTS.some(function (x) { return x[0] === ACTIVE; });
  var html =
    "<div class=\"topbar\" id=\"yl-topbar\">" +
    "<div class=\"wrap\">" +
    "<a class=\"topbar-brand\" href=\"https://yatslist.com/szevents/\" aria-label=\"Yat's List\"><span class=\"brandmark\">&gt; yat's list<span class=\"cur\">_</span></span></a>" +
    "<button id=\"mnav-btn\" type=\"button\" aria-expanded=\"false\" aria-haspopup=\"true\" data-yl=\"menu\">" + esc(S[LANG].menu) + "</button>" +
    "<div id=\"mnav-panel\"><nav class=\"topbar-nav\">" +
    (cfg.label && SHOW_EXTRAS ? "<a href=\"" + esc(location.pathname) + "\" class=\"nav-on yl-label\" aria-current=\"page\">" + esc(cfg.label) + "</a>" : "") +
    MAIN.map(function (x) { return link(x[0], x[1], x[2]); }).join("") +
    "<span class=\"yl-dd\"" + (SHOW_EXTRAS ? "" : " hidden") + "><button type=\"button\" class=\"yl-dd-btn" + (listOn ? " nav-on" : "") + "\" aria-expanded=\"false\" aria-haspopup=\"true\"><span data-yl=\"lists\">" + esc(S[LANG].lists) + "</span><svg class=\"yl-caret\" aria-hidden=\"true\" width=\"10\" height=\"6\" viewBox=\"0 0 10 6\"><path d=\"M1 1l4 4 4-4\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\"/></svg></button>" +
    "<span class=\"yl-dd-head\" data-yl=\"lists\" aria-hidden=\"true\">" + esc(S[LANG].lists) + "</span>" +
    "<span class=\"yl-dd-menu\">" + LISTS.map(function (x) { return link(x[0], x[1], x[0]); }).join("") + "</span></span>" +
    "<span class=\"prefs\">" +
    "<select class=\"langsel\" id=\"langsel\" aria-label=\"Language\"" + (I18N ? "" : " hidden") + "><option value=\"zh\">简体</option><option value=\"tw\">繁體</option><option value=\"en\">EN</option></select>" +
    "<button type=\"button\" class=\"themecyc\" id=\"themecyc\" aria-label=\"Theme\"" + (DARK_ONLY ? " hidden" : "") + ">&#9680;</button>" +
    "</span>" +
    "</nav></div>" +
    "</div>" +
    "</div>";
  var tmp = d.createElement("div"); tmp.innerHTML = html;
  var bar = tmp.firstChild, nav = bar.querySelector(".topbar-nav"), prefs = bar.querySelector(".prefs");
  while (ph.firstElementChild) nav.insertBefore(ph.firstElementChild, prefs);
  ph.parentNode.replaceChild(bar, ph);

  var $ = function (s) { return bar.querySelector(s); };
  var sel = $("#langsel"), cyc = $("#themecyc"), mbtn = $("#mnav-btn"), panel = $("#mnav-panel"), dd = $(".yl-dd"), ddb = $(".yl-dd-btn");
  sel.value = LANG;

  function labelText() { return LANG === "en" ? (cfg.labelEn || cfg.label) : LANG === "tw" ? (cfg.labelTw || cfg.label) : cfg.label; }
  function syncLabels() {
    var t = S[LANG];
    Array.prototype.forEach.call(bar.querySelectorAll("[data-yl]"), function (el) { el.textContent = t[el.getAttribute("data-yl")]; });
    var lb = $(".yl-label"); if (lb) lb.textContent = labelText();
    sel.value = LANG; sel.setAttribute("aria-label", t.lang);
    syncThemeBtn();
  }
  function syncThemeBtn() {
    var t = S[LANG], label = t.themeLabel + ": " + t.theme[THEME];
    cyc.textContent = { auto: "◐", light: "☀", dark: "☾" }[THEME]; cyc.title = label; cyc.setAttribute("aria-label", label);
  }
  function applyTheme() {
    var r = resolved();
    root.setAttribute("data-theme", r); root.setAttribute("data-theme-mode", THEME);
    var tc = d.querySelector("meta[name=\"theme-color\"]"); if (tc) tc.setAttribute("content", r === "light" ? "#f6f8f7" : "#0d1218");
    syncThemeBtn();
    return r;
  }

  /* ---------- API ---------- */
  var langCbs = [], themeCbs = [];
  function fire(list, args, name, detail) {
    list.slice().forEach(function (cb) { try { cb.apply(null, args); } catch (e) { setTimeout(function () { throw e; }); } });
    try { d.dispatchEvent(new CustomEvent(name, { detail: detail })); } catch (e) {}
  }
  var YL = window.YL = {
    lang: LANG,
    theme: THEME,
    setLang: function (l) {
      l = norm(l);
      try { localStorage.setItem("szLang", l); } catch (e) {}
      if (FIXED && BASE) { if (l !== LANG) location.href = BASE + (l === "zh" ? "" : l + "/") + location.hash; return; }
      if (!I18N || l === LANG) { sel.value = LANG; return; }
      LANG = YL.lang = l;
      syncLabels();
      fire(langCbs, [l], "yl:lang", { lang: l });
    },
    setTheme: function (t) {
      THEME = YL.theme = (t === "light" || t === "dark") ? t : "auto";
      try { localStorage.setItem("szTheme", THEME); } catch (e) {}
      var r = applyTheme();
      fire(themeCbs, [THEME, r], "yl:theme", { theme: THEME, resolved: r });
    },
    onLang: function (cb) { if (typeof cb === "function") langCbs.push(cb); },
    onTheme: function (cb) { if (typeof cb === "function") themeCbs.push(cb); }
  };

  /* ---------- behaviour ---------- */
  sel.addEventListener("change", function () { YL.setLang(sel.value); });
  cyc.addEventListener("click", function () { var o = ["auto", "light", "dark"]; YL.setTheme(o[(o.indexOf(THEME) + 1) % 3]); });
  if (mq.addEventListener) mq.addEventListener("change", function () {
    if (THEME === "auto" && !DARK_ONLY) { var r = applyTheme(); fire(themeCbs, [THEME, r], "yl:theme", { theme: THEME, resolved: r }); }
  });

  function closeDd() { dd.classList.remove("open"); ddb.setAttribute("aria-expanded", "false"); }
  function closePanel() { panel.classList.remove("open"); mbtn.setAttribute("aria-expanded", "false"); }
  ddb.addEventListener("click", function (e) { e.stopPropagation(); ddb.setAttribute("aria-expanded", dd.classList.toggle("open") ? "true" : "false"); });
  mbtn.addEventListener("click", function (e) { e.stopPropagation(); mbtn.setAttribute("aria-expanded", panel.classList.toggle("open") ? "true" : "false"); });
  panel.addEventListener("click", function (e) { if (e.target.closest("a") || e.target.closest(".nav-submit")) { closePanel(); closeDd(); } });
  d.addEventListener("click", function (e) {
    if (!dd.contains(e.target)) closeDd();
    if (!panel.contains(e.target) && e.target !== mbtn) closePanel();
  });
  d.addEventListener("keydown", function (e) { if (e.key === "Escape") { if (dd.classList.contains("open")) { closeDd(); ddb.focus(); } closePanel(); } });

  /* "Agent" link: first nav item when the page has an agent box */
  function addAgent() {
    var href = cfg.agent || (d.getElementById("agentbox") ? "#agentbox" : "");
    if (!SHOW_EXTRAS || !href || $(".yl-agent")) return;
    var a = d.createElement("a"); a.href = href; a.className = "yl-agent"; a.setAttribute("data-yl", "agent"); a.textContent = S[LANG].agent;
    nav.insertBefore(a, nav.firstChild);
  }
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", addAgent); else addAgent();

  syncLabels();
  applyTheme();
})();
