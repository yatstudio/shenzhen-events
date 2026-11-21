/* Yat's List · 纪要页主题切换（自动 → 白天 → 晚上），与其他清单共用 localStorage 的 szTheme */
(function () {
  var THEMES = ["auto", "light", "dark"], ICON = { auto: "◐", light: "☀", dark: "☾" }, NAME = { auto: "自动", light: "白天", dark: "晚上" };
  var mq = window.matchMedia("(prefers-color-scheme: dark)"), b = document.getElementById("themecyc");
  function mode() { var t; try { t = localStorage.getItem("szTheme"); } catch (e) {} return THEMES.indexOf(t) >= 0 ? t : "auto"; }
  function apply() {
    var t = mode(), d = t === "dark" || (t === "auto" && mq.matches);
    document.documentElement.setAttribute("data-theme", d ? "dark" : "light");
    document.documentElement.setAttribute("data-theme-mode", t);
    if (b) { b.textContent = ICON[t]; b.title = "主题：" + NAME[t]; b.setAttribute("aria-label", b.title); }
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", d ? "#0d1218" : "#f6f8f7");
  }
  if (b) b.addEventListener("click", function () {
    try { localStorage.setItem("szTheme", THEMES[(THEMES.indexOf(mode()) + 1) % 3]); } catch (e) {}
    apply();
  });
  if (mq.addEventListener) mq.addEventListener("change", apply);
  apply();
  // tables scroll sideways inside a rounded box instead of squeezing their columns
  Array.prototype.forEach.call(document.querySelectorAll("article table"), function (t) {
    if (t.parentNode.classList.contains("tblwrap")) return;
    var w = document.createElement("div"); w.className = "tblwrap"; t.parentNode.insertBefore(w, t); w.appendChild(t);
  });
})();
