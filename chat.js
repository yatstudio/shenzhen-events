/* Yat's List · AI 活动助手 (shared by /szevents/ and /hkevents/).
   Markup needed in the page: <button id="yl-open" data-city="sz|hk" aria-expanded="false">🤖 问 AI</button>
   This script builds the panel (appended to <body>), styles it, and talks to https://submit.yatslist.com/api/chat.
   The chat API has no city parameter of its own (it answers from the whole site), so each request sends `city`
   (for a future backend) and prefixes the newest user message with a one-line page context, e.g.
   "[页面：香港活动清单 /hkevents/。除非我另外指定城市，只回答香港的活动]". The context is never shown in the UI.
   < 820px: full-screen sheet (safe-area padding, follows visualViewport so the input stays above the iOS keyboard,
   body scroll locked, Esc / back button close). Desktop: panel at the bottom right, max 440px wide, max 80vh. */
(function () {
  "use strict";
  if (window.YLChat) return;
  var d = document, API = "https://submit.yatslist.com/api/chat";
  var fab = d.getElementById("yl-open");
  if (!fab) return;
  var city = fab.getAttribute("data-city") === "hk" ? "hk" : "sz";

  var T = {
    zh: { open: "🤖 问 AI", title: "🤖 AI 活动助手", sub: { sz: "深圳活动 · 数据来自本站实时清单", hk: "香港活动 · 数据来自本站实时清单" }, close: "关闭", send: "发送",
      ph: { sz: "问我深圳活动：时间、地点、报名…", hk: "问我香港活动：时间、地点、报名…" },
      hi: { sz: "你好，我是 Yat's List 的小助手，深圳活动清单里的活动我都认得。想找什么活动，直接问我：比如「这周南山有什么 AI 活动？」",
            hk: "你好，我是 Yat's List 的小助手，香港活动清单里的活动我都认得。想找什么活动，直接问我：比如「这周中环有什么 AI 活动？」" },
      chips: { sz: ["本周有什么 AI 活动？", "周末去哪？", "哪些活动免费？"], hk: ["本周有什么 AI 活动？", "周末去哪？", "哪些活动免费？"] },
      ctx: { sz: "[页面：深圳活动清单 /szevents/。除非我另外指定城市，只回答深圳的活动]", hk: "[页面：香港活动清单 /hkevents/。除非我另外指定城市，只回答香港的活动]" },
      wait: "正在翻清单…", err: "😅 出了点问题，稍后再问我", net: "😅 网络有点问题，稍后再问我" },
    tw: { open: "🤖 問 AI", title: "🤖 AI 活動助手", sub: { sz: "深圳活動 · 數據來自本站實時清單", hk: "香港活動 · 數據來自本站實時清單" }, close: "關閉", send: "發送",
      ph: { sz: "問我深圳活動：時間、地點、報名…", hk: "問我香港活動：時間、地點、報名…" },
      hi: { sz: "你好，我是 Yat's List 的小助手，深圳活動清單裡的活動我都認得。想找什麼活動，直接問我：比如「這週南山有什麼 AI 活動？」",
            hk: "你好，我是 Yat's List 的小助手，香港活動清單裡的活動我都認得。想找什麼活動，直接問我：比如「這週中環有什麼 AI 活動？」" },
      chips: { sz: ["本週有什麼 AI 活動？", "週末去哪？", "哪些活動免費？"], hk: ["本週有什麼 AI 活動？", "週末去哪？", "哪些活動免費？"] },
      ctx: { sz: "[頁面：深圳活動清單 /szevents/。除非我另外指定城市，只回答深圳的活動，用繁體中文回答]", hk: "[頁面：香港活動清單 /hkevents/。除非我另外指定城市，只回答香港的活動，用繁體中文回答]" },
      wait: "正在翻清單…", err: "😅 出了點問題，稍後再問我", net: "😅 網絡有點問題，稍後再問我" },
    en: { open: "🤖 Ask AI", title: "🤖 AI event assistant", sub: { sz: "Shenzhen · answers from the live list", hk: "Hong Kong · answers from the live list" }, close: "Close", send: "Send",
      ph: { sz: "Ask about Shenzhen events…", hk: "Ask about Hong Kong events…" },
      hi: { sz: "Hi, I'm the Yat's List assistant and I know every event on the Shenzhen list. Ask me anything, e.g. “Any AI events in Nanshan this week?”",
            hk: "Hi, I'm the Yat's List assistant and I know every event on the Hong Kong list. Ask me anything, e.g. “Any AI events in Central this week?”" },
      chips: { sz: ["AI events this week?", "What's on this weekend?", "Which events are free?"], hk: ["AI events this week?", "What's on this weekend?", "Which events are free?"] },
      ctx: { sz: "[Page: Shenzhen events list /szevents/. Unless I name another city, only answer about Shenzhen events. Reply in English]", hk: "[Page: Hong Kong events list /hkevents/. Unless I name another city, only answer about Hong Kong events. Reply in English]" },
      wait: "Looking through the list…", err: "😅 Something went wrong, please try again later", net: "😅 Network problem, please try again later" }
  };
  function lang() { var l = window.YL && YL.lang; return l === "en" || l === "tw" ? l : "zh"; }
  function t() { return T[lang()]; }

  var css =
    "#yl-panel{position:fixed;z-index:160;right:16px;bottom:16px;width:min(440px,calc(100vw - 32px));height:min(640px,80vh);display:none;flex-direction:column;overflow:hidden;" +
      "background:var(--panel);color:var(--ink);border:1px solid var(--border-hover);border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.35)}" +
    "#yl-panel.open{display:flex}" +
    "#yl-panel *{box-sizing:border-box}" +
    ".yl-head{flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:6px 6px 6px 16px;border-bottom:1px solid var(--border)}" +
    ".yl-ht{flex:1;min-width:0}.yl-ht b{display:block;font-size:.98rem;line-height:1.3}" +
    ".yl-ht small{display:block;color:var(--ink-ter);font-size:.78rem;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    "#yl-close{flex:0 0 auto;width:44px;height:44px;display:inline-flex;align-items:center;justify-content:center;background:none;border:0;border-radius:10px;color:var(--ink-sec);font-size:1.15rem;cursor:pointer}" +
    "#yl-close:hover{background:var(--panel-hover);color:var(--ink)}" +
    "#yl-msgs{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:14px;display:flex;flex-direction:column;gap:10px;font-size:.94rem;line-height:1.6}" +
    ".yl-m{max-width:85%;min-width:0;padding:9px 12px;border-radius:14px;overflow-wrap:anywhere;word-break:break-word}" +
    ".yl-m.u{align-self:flex-end;background:var(--green);color:var(--on-green,#06281c);border-bottom-right-radius:4px;white-space:pre-wrap}" +
    ".yl-m.a{align-self:flex-start;background:var(--panel-hover);border:1px solid var(--border);border-bottom-left-radius:4px}" +
    ".yl-m.wait{color:var(--ink-sec)}" +
    ".yl-m a{color:var(--green);text-decoration:underline;overflow-wrap:anywhere;word-break:break-all}" +
    ".yl-m p{margin:0}.yl-m p+p,.yl-m p+ul,.yl-m p+ol,.yl-m ul+p,.yl-m ol+p{margin-top:6px}" +
    ".yl-m ul,.yl-m ol{margin:4px 0 0;padding-left:1.25em}.yl-m li{margin:2px 0}.yl-m li::marker{color:var(--ink-ter)}" +
    ".yl-chips{flex:0 0 auto;display:flex;gap:8px;flex-wrap:wrap;padding:0 14px 10px}" +
    ".yl-chips button{background:none;border:1px solid var(--border-hover);color:var(--ink-sec);border-radius:999px;min-height:36px;padding:6px 12px;font:inherit;font-size:.84rem;cursor:pointer;white-space:nowrap}" +
    ".yl-chips button:hover{border-color:var(--green);color:var(--green)}" +
    ".yl-inrow{flex:0 0 auto;display:flex;gap:8px;padding:10px 12px;border-top:1px solid var(--border);background:var(--panel)}" +
    "#yl-input{flex:1;min-width:0;height:44px;background:var(--bg);border:1px solid var(--border-hover);border-radius:12px;color:var(--ink);padding:0 12px;font:inherit;font-size:16px;outline:none}" +
    "#yl-input:focus{border-color:var(--green)}" +
    "#yl-send{flex:0 0 auto;min-width:64px;height:44px;background:var(--green);color:var(--on-green,#06281c);border:0;border-radius:12px;padding:0 16px;font:inherit;font-size:.95rem;font-weight:700;cursor:pointer}" +
    "#yl-send:disabled{opacity:.5;cursor:default}" +
    "@media (max-width:820px){" +
      "#yl-panel{left:0;right:0;top:0;bottom:auto;width:100%;height:100vh;height:var(--yl-vvh,100dvh);max-height:none;border:0;border-radius:0;box-shadow:none;background:var(--bg);" +
        "padding:env(safe-area-inset-top) env(safe-area-inset-right) 0 env(safe-area-inset-left);transform:translateY(var(--yl-vvtop,0px))}" +
      ".yl-head{background:var(--panel);padding-left:14px}" +
      ".yl-chips{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;padding-bottom:10px}.yl-chips::-webkit-scrollbar{display:none}" +
      ".yl-inrow{padding-bottom:calc(10px + env(safe-area-inset-bottom))}" +
      ".yl-open-kb .yl-inrow{padding-bottom:10px}" +
    "}" +
    "html.yl-lock,html.yl-lock body{overflow:hidden}html.yl-lock body{position:fixed;left:0;right:0;width:100%}";
  var st = d.createElement("style"); st.id = "yl-chat-css"; st.textContent = css; (d.head || d.documentElement).appendChild(st);

  var panel = d.createElement("div");
  panel.id = "yl-panel"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "false"); panel.setAttribute("aria-labelledby", "yl-title");
  panel.innerHTML =
    '<div class="yl-head"><div class="yl-ht"><b id="yl-title"></b><small id="yl-sub"></small></div><button type="button" id="yl-close">✕</button></div>' +
    '<div id="yl-msgs" aria-live="polite"></div>' +
    '<div class="yl-chips" id="yl-chips"></div>' +
    '<form class="yl-inrow" id="yl-form"><input id="yl-input" type="text" enterkeyhint="send" autocomplete="off" maxlength="500"><button type="submit" id="yl-send"></button></form>';
  d.body.appendChild(panel);
  fab.setAttribute("aria-controls", "yl-panel");
  var msgs = panel.querySelector("#yl-msgs"), inp = panel.querySelector("#yl-input"), send = panel.querySelector("#yl-send"), chips = panel.querySelector("#yl-chips");
  var hist = [], greet = null, busy = false, isOpen = false, pushed = false;

  /* ---------- text rendering: escape first, then links, **bold**, lists, paragraphs ---------- */
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function inline(s) {
    return esc(s)
      .replace(/(https?:\/\/[^\s<>"）)】，。、]+)/g, function (u) { var tail = ""; while (/[.,;:!?]$/.test(u)) { tail = u.slice(-1) + tail; u = u.slice(0, -1); } return '<a href="' + u + '" target="_blank" rel="noopener">' + u + "</a>" + tail; })
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  }
  function fmt(text) {
    var out = [], list = null, para = [];
    function flushP() { if (para.length) { out.push("<p>" + para.join("<br>") + "</p>"); para = []; } }
    function flushL() { if (list) { out.push("<" + list.tag + ">" + list.items.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</" + list.tag + ">"); list = null; } }
    String(text || "").split(/\n/).forEach(function (raw) {
      var line = raw.replace(/\s+$/, ""), m;
      if (!line.trim()) { flushP(); flushL(); return; }
      if ((m = /^\s*[-*•]\s+(.*)$/.exec(line)) || (m = /^\s*\d+[.)、]\s+(.*)$/.exec(line))) {
        var tag = /^\s*\d/.test(line) ? "ol" : "ul", indented = /^\s{2,}/.test(line);
        if (indented && list && list.items.length) { list.items[list.items.length - 1] += "<br>" + inline(m[1]); return; }
        flushP(); if (list && list.tag !== tag) flushL();
        if (!list) list = { tag: tag, items: [] };
        list.items.push(inline(m[1])); return;
      }
      if (list && /^\s{2,}/.test(line)) { list.items[list.items.length - 1] += "<br>" + inline(line.trim()); return; }
      flushL(); para.push(inline(line.trim()));
    });
    flushP(); flushL();
    return out.join("");
  }
  function add(role, text, cls) {
    var el = d.createElement("div"); el.className = "yl-m " + (role === "user" ? "u" : "a") + (cls ? " " + cls : "");
    if (role === "user") el.textContent = text; else el.innerHTML = fmt(text);
    msgs.appendChild(el); msgs.scrollTop = msgs.scrollHeight; return el;
  }

  function paint() {
    var x = t();
    var parts = x.open.split(" "), icon = parts.shift();
    fab.innerHTML = '<span aria-hidden="true">' + icon + '</span><span class="yl-open-t">' + esc(parts.join(" ")) + "</span>";
    fab.setAttribute("aria-label", parts.join(" "));
    panel.querySelector("#yl-title").textContent = x.title.replace(/^🤖\s*/, "🤖 ");
    panel.querySelector("#yl-sub").textContent = x.sub[city];
    panel.setAttribute("aria-label", x.title);
    var c = panel.querySelector("#yl-close"); c.setAttribute("aria-label", x.close); c.title = x.close;
    inp.placeholder = x.ph[city]; send.textContent = x.send;
    chips.innerHTML = x.chips[city].map(function (q) { return '<button type="button">' + esc(q) + "</button>"; }).join("");
    if (greet && !hist.length) greet.innerHTML = fmt(x.hi[city]);
  }

  /* ---------- body scroll lock (mobile sheet only) ---------- */
  var lockY = 0;
  function lock() { var h = d.documentElement; if (h.classList.contains("yl-lock")) return; lockY = window.scrollY || h.scrollTop || 0; d.body.style.top = -lockY + "px"; h.classList.add("yl-lock"); }
  function unlock() { var h = d.documentElement; if (!h.classList.contains("yl-lock")) return; h.classList.remove("yl-lock"); d.body.style.top = ""; var b = h.style.scrollBehavior; h.style.scrollBehavior = "auto"; window.scrollTo(0, lockY); h.style.scrollBehavior = b; }
  var mq = window.matchMedia("(max-width:820px)");
  function mobile() { return mq.matches; }

  /* ---------- keep the sheet inside the visual viewport (iOS keyboard) ---------- */
  var vv = window.visualViewport;
  function fitViewport() {
    var h = d.documentElement;
    if (!isOpen || !mobile() || !vv) { h.style.removeProperty("--yl-vvh"); h.style.removeProperty("--yl-vvtop"); panel.classList.remove("yl-open-kb"); return; }
    h.style.setProperty("--yl-vvh", Math.round(vv.height) + "px");
    h.style.setProperty("--yl-vvtop", Math.round(vv.offsetTop) + "px");
    panel.classList.toggle("yl-open-kb", window.innerHeight - vv.height > 120);
    msgs.scrollTop = msgs.scrollHeight;
  }
  if (vv) { vv.addEventListener("resize", fitViewport); vv.addEventListener("scroll", fitViewport); }
  if (mq.addEventListener) mq.addEventListener("change", function () { if (!isOpen) return; if (mobile()) lock(); else unlock(); fitViewport(); });

  function open() {
    if (isOpen) return; isOpen = true;
    panel.classList.add("open"); fab.setAttribute("aria-expanded", "true");
    if (!greet) greet = add("assistant", t().hi[city]);
    if (mobile()) {
      lock();
      try { history.pushState({ ylChat: 1 }, ""); pushed = true; } catch (e) { pushed = false; }
    }
    fitViewport();
    if (!mobile()) inp.focus();
  }
  function close(fromPop) {
    if (!isOpen) return; isOpen = false;
    panel.classList.remove("open"); fab.setAttribute("aria-expanded", "false");
    inp.blur(); unlock(); fitViewport();
    if (pushed && !fromPop) { pushed = false; try { if (history.state && history.state.ylChat) history.back(); } catch (e) {} }
    pushed = false;
    fab.focus({ preventScroll: true });
  }
  window.addEventListener("popstate", function () { if (isOpen) close(true); });
  fab.addEventListener("click", function () { if (isOpen) close(); else open(); });
  panel.querySelector("#yl-close").addEventListener("click", function () { close(); });
  d.addEventListener("keydown", function (e) { if (e.key === "Escape" && isOpen) { e.stopPropagation(); close(); } }, true);
  chips.addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { inp.value = b.textContent; doSend(); } });
  panel.querySelector("#yl-form").addEventListener("submit", function (e) { e.preventDefault(); doSend(); });

  function payload() {
    var m = hist.slice(-12).map(function (x) { return { role: x.role, content: x.content }; });
    for (var i = m.length - 1; i >= 0; i--) if (m[i].role === "user") { m[i].content = t().ctx[city] + "\n" + m[i].content; break; }
    return { city: city, lang: lang(), messages: m };
  }
  function doSend() {
    var q = inp.value.trim(); if (!q || busy) return;
    busy = true; send.disabled = true;
    add("user", q); hist.push({ role: "user", content: q }); inp.value = "";
    var x = t(), wait = add("assistant", x.wait, "wait");
    fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload()) })
      .then(function (r) { return r.json(); })
      .then(function (j) { var a = j && j.reply ? j.reply : x.err + (j && j.error ? "（" + j.error + "）" : ""); wait.classList.remove("wait"); wait.innerHTML = fmt(a); if (j && j.reply) hist.push({ role: "assistant", content: a }); msgs.scrollTop = msgs.scrollHeight; })
      .catch(function () { wait.classList.remove("wait"); wait.textContent = x.net; })
      .then(function () { busy = false; send.disabled = false; if (!mobile()) inp.focus(); });
  }

  paint();
  if (window.YL && YL.onLang) YL.onLang(function () { setTimeout(paint, 0); });
  window.YLChat = { open: open, close: close, city: city };
})();
