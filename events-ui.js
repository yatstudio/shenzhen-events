/* Yat's List · shared UI behaviour for the city event pages (/szevents/, /hkevents/). Styles: /events.css.
   Uses only ids both pages have; the page's own script keeps the filter state.
   1. Filter drawer (#fgroups): < 820px it is a bottom sheet (backdrop, own scroll, close ✕, "done · N events" button,
      Esc / back button close, page scroll locked). Opening/closing always goes through the page's #ftoggle button,
      so the page's aria-expanded state and measureBar() stay in sync. Desktop: unchanged inline panel.
   2. Agent box (#agentbox): < 820px collapsed to title + subscribe button; the ▾ button shows the command line. */
(function () {
  "use strict";
  var d = document, mq = window.matchMedia("(max-width:820px)");
  var L = {
    zh: { title: "筛选", close: "关闭", done: "完成", abMore: "展开订阅命令", abLess: "收起订阅命令" },
    tw: { title: "篩選", close: "關閉", done: "完成", abMore: "展開訂閱命令", abLess: "收起訂閱命令" },
    en: { title: "Filters", close: "Close", done: "Done", abMore: "Show subscribe command", abLess: "Hide subscribe command" }
  };
  function t() { var l = window.YL && YL.lang; return L[l === "en" || l === "tw" ? l : "zh"]; }

  /* ---------- 1. filter bottom sheet ---------- */
  var fg = d.getElementById("fgroups"), tog = d.getElementById("ftoggle");
  var bg = null, pushed = false, lockY = 0;
  function isOpen() { return !!fg && fg.classList.contains("open"); }
  function lock() { var h = d.documentElement; if (h.classList.contains("fs-lock")) return; lockY = window.scrollY || 0; d.body.style.top = -lockY + "px"; h.classList.add("fs-lock"); }
  function unlock() { var h = d.documentElement; if (!h.classList.contains("fs-lock")) return; h.classList.remove("fs-lock"); d.body.style.top = ""; var b = h.style.scrollBehavior; h.style.scrollBehavior = "auto"; window.scrollTo(0, lockY); h.style.scrollBehavior = b; }
  function closeSheet() { if (isOpen() && tog) tog.click(); }
  function sync() {
    if (!fg) return;
    var sheet = isOpen() && mq.matches;
    if (bg) bg.classList.toggle("open", sheet);
    fg.setAttribute("role", sheet ? "dialog" : "group");
    if (sheet) fg.setAttribute("aria-modal", "true"); else fg.removeAttribute("aria-modal");
    if (sheet) {
      lock();
      if (!pushed) { try { history.pushState({ ylSheet: 1 }, ""); pushed = true; } catch (e) {} }
    } else {
      unlock();
      if (pushed) { pushed = false; try { if (history.state && history.state.ylSheet) history.back(); } catch (e) {} }
    }
  }
  function paintSheet() {
    if (!fg) return;
    var x = t(), ti = d.getElementById("fs-title"), cl = d.getElementById("fs-close"), ap = d.getElementById("fs-apply"), fr = d.getElementById("fres");
    if (ti) ti.textContent = x.title;
    if (cl) { cl.setAttribute("aria-label", x.close); cl.title = x.close; }
    if (ap) ap.textContent = x.done + (fr && fr.textContent ? " · " + fr.textContent : "");
  }
  if (fg && tog) {
    bg = d.createElement("div"); bg.className = "fsheet-bg"; bg.setAttribute("aria-hidden", "true");
    d.body.appendChild(bg);
    bg.addEventListener("click", closeSheet);
    var cl = d.getElementById("fs-close"), ap = d.getElementById("fs-apply");
    if (cl) cl.addEventListener("click", closeSheet);
    if (ap) ap.addEventListener("click", closeSheet);
    new MutationObserver(sync).observe(fg, { attributes: true, attributeFilter: ["class"] });
    var fr = d.getElementById("fres");
    if (fr) new MutationObserver(paintSheet).observe(fr, { childList: true, characterData: true, subtree: true });
    window.addEventListener("popstate", function () { if (pushed && isOpen()) { pushed = false; closeSheet(); } });
    d.addEventListener("keydown", function (e) { if (e.key === "Escape" && isOpen() && mq.matches) closeSheet(); });
    if (mq.addEventListener) mq.addEventListener("change", sync);
    paintSheet();
  }

  /* ---------- 2. agent box collapse ---------- */
  var ab = d.getElementById("agentbox"), abBtn = null;
  function paintAb() { if (!abBtn) return; var o = ab.classList.contains("ab-open"), x = t(); abBtn.setAttribute("aria-expanded", o ? "true" : "false"); abBtn.setAttribute("aria-label", o ? x.abLess : x.abMore); abBtn.title = abBtn.getAttribute("aria-label"); }
  if (ab) {
    abBtn = d.createElement("button"); abBtn.type = "button"; abBtn.className = "ab-toggle"; abBtn.innerHTML = '<span aria-hidden="true">▾</span>';
    ab.appendChild(abBtn);
    abBtn.addEventListener("click", function () { ab.classList.toggle("ab-open"); paintAb(); });
    paintAb();
  }

  if (window.YL && YL.onLang) YL.onLang(function () { setTimeout(function () { paintSheet(); paintAb(); }, 0); });
})();
