/* Yat's List: list counts + "new today" from /stats.json.
   Fills <div class="ylstat" data-list="..."> and adds a count badge to the 黑客松 menu link
   and the homepage hackathon banner (<a class="hackhero">).
   City cards: <a class="hackhero cityhero" data-city="sz|hk"> link the other city's page with its count
   (sz: lists.events, hk: lists.hkevents).
   Optional data-week="N" on .ylstat (set by the page from its own data: events starting in the next 7 days) adds
   "本周 N 场" after the stats.json figures; the page calls YLStats.render() after setting it. */
(function () {
  var U = {
    zh: { events: "场活动在列", hk: "场香港活动在列", hkevents: "场活动在列", hackathons: "场黑客松正在报名", talks: "场谈话", vps: "个套餐", xlist: "位", expat: "场活动", remote: "个岗位", nomadlist: "座城市", notes: "篇笔记",
      today: "今日新增", last: "最近新增", week: "近 7 天", upcoming: function (n) { return "本周 " + n + " 场"; }, none: "今日暂无新增",
      hackTitle: "全球黑客松", hackSub: function (n) { return n + " 场正在报名，每天核实更新"; }, go: "去看 →",
      chtfTitle: "高交会专题", chtfSub: "11月26–28日 · 深圳国际会展中心（宝安）· 4 场同期活动 + 1,529 家展商展位查询",
      szTitle: "深圳活动", szSub: "AI、创业、科技、跨境活动，每天核实更新", hkTitle: "香港活动", hkSub: "香港全量活动，三语，按行政区筛选" },
    tw: { events: "場活動在列", hk: "場香港活動在列", hkevents: "場活動在列", hackathons: "場黑客松正在報名", talks: "場談話", vps: "個套餐", xlist: "位", expat: "場活動", remote: "個崗位", nomadlist: "座城市", notes: "篇筆記",
      today: "今日新增", last: "最近新增", week: "近 7 天", upcoming: function (n) { return "本週 " + n + " 場"; }, none: "今日暫無新增",
      hackTitle: "全球黑客松", hackSub: function (n) { return n + " 場正在報名，每天核實更新"; }, go: "去看 →",
      chtfTitle: "高交會專題", chtfSub: "11月26–28日 · 深圳國際會展中心（寶安）· 4 場同期活動 + 1,529 家展商展位查詢",
      szTitle: "深圳活動", szSub: "AI、創業、科技、跨境活動，每天核實更新", hkTitle: "香港活動", hkSub: "香港全量活動，三語，按行政區篩選" },
    en: { events: "events listed", hk: "Hong Kong events listed", hkevents: "events listed", hackathons: "hackathons open", talks: "talks", vps: "plans", xlist: "people", expat: "events", remote: "jobs", nomadlist: "cities", notes: "notes",
      today: "New today", last: "Last added", week: "Last 7 days", upcoming: function (n) { return n + " this week"; }, none: "Nothing new yet today",
      hackTitle: "Global hackathons", hackSub: function (n) { return n + " open for registration, verified daily"; }, go: "Browse →",
      chtfTitle: "CHTF 2026 topic", chtfSub: "Nov 26–28 · Shenzhen World Exhibition & Convention Center · 4 events + 1,529 exhibitors with booth lookup",
      szTitle: "Shenzhen events", szSub: "AI, startup, tech and cross-border events, verified daily", hkTitle: "Hong Kong events", hkSub: "All Hong Kong events, in three languages, by district" }
  };
  function lang() { var l = window.YL && YL.lang; if (!l) try { l = localStorage.getItem("szLang"); } catch (e) {} return l === "en" || l === "tw" ? l : "zh"; }
  function md(d, L) { var m = +d.slice(5, 7), dd = +d.slice(8, 10); return L === "en" ? ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m - 1] + " " + dd : m + "月" + dd + "日"; }
  // .ylstat is styled only here (one copy for every page). The row wraps between items; an item wider than the row breaks inside itself.
  var css = ".ylstat{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 14px;margin:10px 0 0;max-width:100%;min-width:0;font-size:.88rem;color:var(--ink-sec,#8b98a5);font-variant-numeric:tabular-nums}" +
    ".ylstat>span{min-width:0;max-width:100%;overflow-wrap:anywhere}.ylstat .up{flex-wrap:wrap}" +
    ".ylstat:empty{display:none}.ylstat .n{font-size:1.5rem;font-weight:800;color:var(--ink,#e6edf3);letter-spacing:-.01em;margin-right:4px}" +
    ".ylstat .up{display:inline-flex;align-items:baseline;gap:4px;color:var(--green,#2ee6a8);font-weight:700;background:rgba(46,230,168,.10);border:1px solid rgba(46,230,168,.35);border-radius:999px;padding:1px 10px}" +
    ".ylstat .up b{font-size:1rem}.ylstat .up.quiet{color:var(--ink-sec,#8b98a5);background:none;border-color:var(--border,rgba(255,255,255,.08));font-weight:600}" +
    ".ylstat .wk{color:var(--ink-ter,#6a737d)}.ylstat .wk-up{color:var(--ink-sec,#8b98a5)}" +
    ".navbadge{display:inline-block;margin-left:5px;padding:0 6px;border-radius:999px;background:var(--green,#2ee6a8);color:#06281c;font-size:.7rem;font-weight:800;line-height:1.55;vertical-align:1px;font-variant-numeric:tabular-nums}" +
    ".hackhero{display:flex;align-items:center;gap:14px;margin:0 0 14px;padding:14px 18px;border-radius:14px;text-decoration:none;color:var(--ink,#e6edf3);background:linear-gradient(90deg,rgba(46,230,168,.16),rgba(46,230,168,.04));border:1px solid rgba(46,230,168,.45)}" +
    ".hackhero:hover{border-color:var(--green,#2ee6a8)}.hackhero .hn{font-size:2rem;font-weight:800;color:var(--green,#2ee6a8);line-height:1;font-variant-numeric:tabular-nums}" +
    ".hackhero .ht{flex:1;min-width:0}.hackhero .ht b{display:block;font-size:1rem}.hackhero .ht span{display:block;font-size:.84rem;color:var(--ink-sec,#8b98a5)}" +
    ".hackhero .hup{color:var(--green,#2ee6a8);font-weight:700}.hackhero .hgo{flex:0 0 auto;font-weight:700;color:var(--green,#2ee6a8);white-space:nowrap}" +
    "[data-theme=light] .ylstat .up{background:rgba(10,125,85,.07)}[data-theme=light] .navbadge{color:#fff}" +
    "[data-theme=light] .hackhero{background:linear-gradient(90deg,rgba(10,125,85,.10),rgba(10,125,85,.02))}" +
    ".hackhero:empty{display:none}" +
    "@media (max-width:820px){.ylstat{gap:4px 10px;font-size:.84rem}}" +
    "@media (max-width:640px){.ylstat .n{font-size:1.3rem}.hackhero{padding:12px 14px;gap:12px}.hackhero .hn{font-size:1.6rem}.hackhero .hgo{display:none}}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  var S = null;
  function render() {
    if (!S) return;
    var L = lang(), T = U[L];
    // stats.json is rebuilt on each data push; after midnight (Shanghai) yesterday's "new today" no longer counts
    var today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    var stale = S.today !== today;
    document.querySelectorAll(".ylstat[data-list]").forEach(function (el) {
      var s = S.lists[el.getAttribute("data-list")]; if (!s) return;
      if (stale) s = Object.assign({}, s, { new_today: 0 });
      var h = '<span><span class="n">' + s.total + "</span>" + (T[el.getAttribute("data-list")] || "") + "</span>";
      if (s.new_today) h += '<span class="up">' + T.today + " <b>+" + s.new_today + "</b></span>";
      else if (s.last_new_day) h += '<span class="up quiet">' + T.last + " +" + s.last_new_count + " · " + md(s.last_new_day, L) + "</span>";
      if (s.new_7d && s.new_7d !== s.new_today) h += '<span class="wk">' + T.week + " +" + s.new_7d + "</span>";
      var wk = el.getAttribute("data-week");
      if (wk !== null && wk !== "" && !isNaN(+wk)) h += '<span class="wk wk-up">' + T.upcoming(+wk) + "</span>";
      el.innerHTML = h;
    });
    var hk = S.lists.hackathons; if (hk && stale) hk = Object.assign({}, hk, { new_today: 0 });
    if (hk) {
      document.querySelectorAll("a.hackhero:not(.chtfhero):not(.cityhero)").forEach(function (a) {
        a.innerHTML = '<span class="hn">' + hk.total + '</span><span class="ht"><b>' + T.hackTitle + "</b><span>" + T.hackSub(hk.total) +
          (hk.new_today ? ' · <span class="hup">' + T.today + " +" + hk.new_today + "</span>" : "") + '</span></span><span class="hgo">' + T.go + "</span>";
      });
    }
    // city cards: the other city's list and its size
    document.querySelectorAll("a.cityhero[data-city]").forEach(function (a) {
      var c = a.getAttribute("data-city"), s = S.lists[c === "hk" ? "hkevents" : "events"];
      if (!s || !(c === "hk" || c === "sz")) return;
      a.innerHTML = '<span class="hn">' + s.total + '</span><span class="ht"><b>' + T[c + "Title"] + "</b><span>" + T[c + "Sub"] + '</span></span><span class="hgo">' + T.go + "</span>";
    });
    // CHTF topic banner: only while the fair runs (through 2026-11-28, Shanghai time)
    document.querySelectorAll("a.chtfhero").forEach(function (a) {
      if (today > "2026-11-28") { a.style.display = "none"; return; }
      a.innerHTML = '<span class="hn">1529</span><span class="ht"><b>' + T.chtfTitle + "</b><span>" + T.chtfSub + '</span></span><span class="hgo">' + T.go + "</span>";
    });
  }
  window.YLStats = { render: render };
  fetch("/stats.json", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) { S = j; render(); }).catch(function () {});
  // re-render after a language switch (pages set szLang, then re-render their own text)
  document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("[data-setlang]")) setTimeout(render, 0); });
  document.addEventListener("yl:lang", function () { setTimeout(render, 0); });
  document.addEventListener("change", function (e) { if (e.target.classList && e.target.classList.contains("langsel")) setTimeout(render, 0); });
})();
