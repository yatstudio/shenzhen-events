/* Yat's List · shared submit modal + modal shell for /szevents/, /hkevents/, /hackathons/, /talks/ (+ /talks/tw/, /talks/en/).
   Self-contained: injects its own CSS (hackathons does not load /events.css). Bump ?v= in all these pages when you change it.
   Page setup (inline, before this file runs or before the first click):
     window.YL_SUBMIT = { kind: "event" | "hackathon" | "talk", city: "sz" | "hk", prompt: function (lang) { return "…"; } };
   API: YLSubmit.open() / YLSubmit.close() — the 「提交活动 / 提交黑客松 / 提交谈话」 modal (Agent tab + email tab).
        YLSubmit.copy(text, button) — copy with 「复制 → 已复制」 feedback on the button.
   It also upgrades the page's own subscribe modal (#ovl): mobile bottom sheet, body scroll lock, back button closes it,
   localized ✕ / 复制 / 定制示例 labels. */
(function () {
  "use strict";
  var d = document, EMAIL = "event.submit@yatslist.com";
  var COPY_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  var L = {
    zh: { close: "关闭", copy: "复制", copied: "已复制", tabAgent: "用 Agent 提交", tabMail: "用邮件提交", openMail: "打开邮件",
      lead: "复制下面这段发给你的 Agent，它会帮你整理并提交。", mailNote: "只需官方链接，我们核实后收录。", copyMail: "复制邮箱", ex: "✏️ 定制示例",
      event: { title: "提交活动", note: "把【】里换成活动名和官方链接", subject: "活动投稿", body: "活动名：\n官方链接：\n时间：\n地点：\n" },
      hackathon: { title: "提交黑客松", note: "把【】里换成比赛名和官方链接", subject: "黑客松投稿", body: "比赛名：\n官方链接：\n时间：\n地点：\n" },
      talk: { title: "提交谈话 / 投稿纪要", note: "把【】里换成谈话名称和原始链接", subject: "谈话投稿", body: "谈话名称：\n原始链接：\n日期：\n主持人 / 嘉宾：\n" },
      hk: "（香港）" },
    tw: { close: "關閉", copy: "複製", copied: "已複製", tabAgent: "用 Agent 提交", tabMail: "用電郵提交", openMail: "打開郵件",
      lead: "複製下面這段發給你的 Agent，它會幫你整理並提交。", mailNote: "只需官方連結，我們核實後收錄。", copyMail: "複製信箱", ex: "✏️ 定製示例",
      event: { title: "提交活動", note: "把【】裡換成活動名和官方連結", subject: "活動投稿", body: "活動名：\n官方連結：\n時間：\n地點：\n" },
      hackathon: { title: "提交黑客松", note: "把【】裡換成比賽名和官方連結", subject: "黑客松投稿", body: "比賽名：\n官方連結：\n時間：\n地點：\n" },
      talk: { title: "提交談話 / 投稿紀要", note: "把【】裡換成談話名稱和原始連結", subject: "談話投稿", body: "談話名稱：\n原始連結：\n日期：\n主持人 / 嘉賓：\n" },
      hk: "（香港）" },
    en: { close: "Close", copy: "Copy", copied: "Copied", tabAgent: "Via your Agent", tabMail: "By email", openMail: "Open email",
      lead: "Copy this and send it to your Agent. It will check the details and submit for you.", mailNote: "The official link is enough. We verify it before listing.", copyMail: "Copy email address", ex: "✏️ Customization examples",
      event: { title: "Submit an event", note: "Replace the [ ] part with the event name and official link", subject: "Event submission", body: "Event name:\nOfficial link:\nDate & time:\nVenue:\n" },
      hackathon: { title: "Submit a hackathon", note: "Replace the [ ] part with the hackathon name and official link", subject: "Hackathon submission", body: "Hackathon name:\nOfficial link:\nDate & time:\nLocation:\n" },
      talk: { title: "Submit a talk or notes", note: "Replace the [ ] part with the talk title and original link", subject: "Talk submission", body: "Talk title:\nOriginal link:\nDate:\nHost / guests:\n" },
      hk: " (Hong Kong)" }
  };
  function lang() { var l = (typeof window.LANG === "string" && window.LANG) || (window.YL && YL.lang); try { if (typeof LANG === "string") l = LANG; } catch (e) {} return l === "en" || l === "tw" ? l : "zh"; }
  function cfg() { var c = window.YL_SUBMIT || {}; return { kind: c.kind === "hackathon" || c.kind === "talk" ? c.kind : "event", city: c.city || "sz", prompt: c.prompt }; }
  function t() { return L[lang()]; }

  /* ---------- CSS (injected after the page styles, so it wins at equal specificity) ---------- */
  var css = [
    ".yx-close{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;min-height:40px;padding:0;border-radius:10px;border:1px solid var(--border-hover,rgba(255,255,255,.16));background:transparent;color:var(--ink-sec);font-size:18px;line-height:1;cursor:pointer;font-family:inherit}",
    ".yx-close:hover{color:var(--ink);background:var(--panel-hover)}",
    ".yx-close:focus-visible,.yx-copy:focus-visible,.ysub-tab:focus-visible{outline:2px solid var(--green);outline-offset:2px}",
    ".ovl .modal{position:relative;max-height:calc(100dvh - 2*clamp(18px,4vw,24px));overflow:auto;overscroll-behavior:contain}",
    ".ovl .mhead{margin-bottom:4px}",
    ".yx-code{position:relative;margin:12px 0 0}",
    ".yx-copy{position:absolute;top:6px;right:6px;z-index:2;display:inline-flex;align-items:center;gap:6px;min-height:40px;min-width:40px;padding:0 12px;border-radius:9px;border:1px solid var(--border-hover,rgba(255,255,255,.16));background:var(--panel);color:var(--ink);font:600 .86rem/1 var(--font-sans,inherit);cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.25)}",
    ".yx-copy:hover{border-color:var(--green);color:var(--green)}",
    ".yx-copy.ok{background:var(--green);border-color:var(--green);color:var(--bg)}",
    ".yx-code pre,.yx-code textarea{display:block;width:100%;margin:0;box-sizing:border-box;padding:54px 14px 14px;border-radius:12px;border:1px solid var(--border-hover,rgba(255,255,255,.16));background:rgba(0,0,0,.3);color:var(--ink);font:400 .86rem/1.65 var(--font-mono,ui-monospace,monospace);white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere}",
    ".yx-code pre{max-height:45vh;overflow:auto;-webkit-overflow-scrolling:touch}",
    ".ovl .yx-code textarea{min-height:200px;resize:vertical;font-size:.88rem}",
    "[data-theme=\"light\"] .yx-code pre,[data-theme=\"light\"] .ovl .yx-code textarea{background:rgba(16,42,32,.04);border-color:rgba(16,42,32,.18)}",
    "[data-theme=\"light\"] .yx-copy{box-shadow:0 1px 3px rgba(16,42,32,.12)}",
    "[data-theme=\"light\"] .yx-copy.ok{color:#fff}",
    ".ysub-lead{margin:6px 0 12px;color:var(--ink-sec);font-size:.92rem;line-height:1.6}",
    ".ysub-tabs{display:flex;gap:4px;padding:4px;border-radius:12px;background:var(--panel-hover);border:1px solid var(--border,rgba(255,255,255,.08))}",
    ".ysub-tab{flex:1 1 0;min-height:40px;border:0;border-radius:9px;background:transparent;color:var(--ink-sec);font:600 .92rem/1.2 var(--font-sans,inherit);cursor:pointer;padding:0 10px}",
    ".ysub-tab[aria-selected=\"true\"]{background:var(--panel);color:var(--ink);box-shadow:0 1px 4px rgba(0,0,0,.25)}",
    "[data-theme=\"light\"] .ysub-tab[aria-selected=\"true\"]{box-shadow:0 1px 3px rgba(16,42,32,.15)}",
    ".ysub-note{margin:10px 0 0;color:var(--ink-ter,var(--ink-sec));font-size:.84rem;line-height:1.5}",
    ".ysub-mail{position:relative;margin-top:12px;padding:14px 64px 14px 14px;border-radius:12px;border:1px solid var(--border-hover,rgba(255,255,255,.16));background:rgba(0,0,0,.3)}",
    "[data-theme=\"light\"] .ysub-mail{background:rgba(16,42,32,.04);border-color:rgba(16,42,32,.18)}",
    ".ysub-addr{display:block;color:var(--green);font:650 1.06rem/1.4 var(--font-mono,ui-monospace,monospace);text-decoration:none;overflow-wrap:anywhere;min-height:24px}",
    ".ysub-mail .yx-copy{top:50%;transform:translateY(-50%);padding:0;width:44px;justify-content:center}",
    ".ysub-send{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:48px;margin-top:12px;border-radius:12px;background:var(--green);color:var(--bg);font:650 .98rem/1 var(--font-sans,inherit);text-decoration:none}",
    "[data-theme=\"light\"] .ysub-send{color:#fff}",
    ".ysub-send:hover{filter:brightness(1.08)}",
    ".mexd{margin-top:10px}",
    ".mexd>summary{cursor:pointer;color:var(--ink-sec);font-size:.86rem;min-height:40px;display:flex;align-items:center;list-style:none;width:max-content;max-width:100%}",
    ".mexd>summary::-webkit-details-marker{display:none}",
    ".mexd>summary::after{content:\"▾\";margin-left:6px;transition:transform .15s}",
    ".mexd[open]>summary::after{transform:rotate(180deg)}",
    ".mexd .mex{margin-top:4px}",
    "html.ysub-lock,html.ysub-lock body{overflow:hidden}",
    "html.ysub-lock body{position:fixed;left:0;right:0;width:100%}",
    "@media (max-width:820px){",
    " .ovl.open{align-items:flex-end;padding:0}",
    " .ovl .modal{width:100%;max-width:100%;max-height:90dvh;border-radius:18px 18px 0 0;border-bottom:0;padding:14px 16px calc(16px + env(safe-area-inset-bottom));animation:ysubUp .22s cubic-bezier(.4,0,.2,1)}",
    " .yx-code pre{max-height:none}",
    " .ovl .yx-code textarea{min-height:180px}",
    "}",
    "@keyframes ysubUp{from{transform:translateY(24px);opacity:.6}to{transform:none;opacity:1}}"
  ].join("\n");
  var st = d.createElement("style"); st.id = "ysub-css"; st.textContent = css; (d.head || d.documentElement).appendChild(st);

  /* ---------- copy ---------- */
  function setCopyLabel(b, ok) {
    var x = t(), lab = b.getAttribute("data-label") || x.copy;
    b.classList.toggle("ok", !!ok);
    b.innerHTML = COPY_SVG + (b.hasAttribute("data-icon-only") ? "" : "<span>" + (ok ? x.copied : lab) + "</span>");
    b.setAttribute("aria-label", ok ? x.copied : (b.getAttribute("data-aria") || lab));
  }
  function fallbackCopy(text) {
    var ta = d.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    d.body.appendChild(ta); ta.select(); var ok = false; try { ok = d.execCommand("copy"); } catch (e) {} d.body.removeChild(ta); return ok;
  }
  function copy(text, b) {
    var done = function () { if (!b) return; setCopyLabel(b, true); clearTimeout(b._yxT); b._yxT = setTimeout(function () { setCopyLabel(b, false); }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { if (fallbackCopy(text)) done(); });
    else if (fallbackCopy(text)) done();
  }

  /* ---------- modal shell: scroll lock + back button, shared by both modals ---------- */
  var lockY = 0, lockN = 0;
  function lock() { if (lockN++) return; var h = d.documentElement; lockY = window.scrollY || 0; d.body.style.top = -lockY + "px"; h.classList.add("ysub-lock"); }
  function unlock() { if (!lockN || --lockN) return; var h = d.documentElement; h.classList.remove("ysub-lock"); d.body.style.top = ""; var sb = h.style.scrollBehavior; h.style.scrollBehavior = "auto"; window.scrollTo(0, lockY); h.style.scrollBehavior = sb; }
  /* watch an overlay's "open" class; close(el) must remove it */
  function shell(ovl, close) {
    var on = false, pushed = false, opener = null;
    function sync() {
      var o = ovl.classList.contains("open");
      if (o === on) return; on = o;
      if (o) {
        opener = d.activeElement; lock();
        try { history.pushState({ ysub: ovl.id }, ""); pushed = true; } catch (e) {}
        var f = ovl.querySelector(".yx-close"); if (f) setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (e) {} }, 0);
      } else {
        unlock();
        if (pushed) { pushed = false; try { if (history.state && history.state.ysub === ovl.id) history.back(); } catch (e) {} }
        if (opener && opener.focus) { try { opener.focus({ preventScroll: true }); } catch (e) {} } opener = null;
      }
    }
    new MutationObserver(sync).observe(ovl, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener("popstate", function () { if (pushed && on) { pushed = false; close(); } });
    d.addEventListener("keydown", function (e) { if (e.key === "Escape" && on) close(); });
    sync();
  }

  /* ---------- submit modal ---------- */
  var ov = null, tab = "agent";
  function mailHref() {
    var c = cfg(), x = t(), k = x[c.kind], subj = k.subject + (c.kind === "event" && c.city === "hk" ? x.hk : "");
    return "mailto:" + EMAIL + "?subject=" + encodeURIComponent(subj) + "&body=" + encodeURIComponent(k.body);
  }
  function build() {
    ov = d.createElement("div"); ov.className = "ovl ysub-ovl"; ov.id = "ysub";
    ov.innerHTML =
      '<div class="modal ysub" role="dialog" aria-modal="true" aria-labelledby="ysub-title">' +
      '<div class="mhead"><h3 id="ysub-title"></h3><button type="button" class="yx-close" id="ysub-close">✕</button></div>' +
      '<p class="ysub-lead" id="ysub-lead"></p>' +
      '<div class="ysub-tabs" role="tablist"><button type="button" class="ysub-tab" role="tab" id="ysub-tab-agent" aria-controls="ysub-p-agent" data-t="agent"></button><button type="button" class="ysub-tab" role="tab" id="ysub-tab-mail" aria-controls="ysub-p-mail" data-t="mail"></button></div>' +
      '<div class="ysub-pane" role="tabpanel" id="ysub-p-agent" aria-labelledby="ysub-tab-agent"><div class="yx-code"><button type="button" class="yx-copy" id="ysub-copy"></button><pre id="ysub-prompt" tabindex="0"></pre></div><p class="ysub-note" id="ysub-note"></p></div>' +
      '<div class="ysub-pane" role="tabpanel" id="ysub-p-mail" aria-labelledby="ysub-tab-mail" hidden><div class="ysub-mail"><a class="ysub-addr" id="ysub-addr"></a><button type="button" class="yx-copy" id="ysub-copy-mail" data-icon-only></button></div><a class="ysub-send" id="ysub-send"></a><p class="ysub-note" id="ysub-mail-note"></p></div>' +
      "</div>";
    d.body.appendChild(ov);
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    ov.querySelector("#ysub-close").addEventListener("click", close);
    ov.querySelector(".ysub-tabs").addEventListener("click", function (e) { var b = e.target.closest("[data-t]"); if (b) { tab = b.getAttribute("data-t"); paint(); } });
    ov.querySelector(".ysub-tabs").addEventListener("keydown", function (e) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      tab = tab === "agent" ? "mail" : "agent"; paint(); var b = ov.querySelector('[data-t="' + tab + '"]'); if (b) b.focus();
    });
    ov.querySelector("#ysub-copy").addEventListener("click", function () { copy(ov.querySelector("#ysub-prompt").textContent, this); });
    ov.querySelector("#ysub-copy-mail").addEventListener("click", function () { copy(EMAIL, this); });
    shell(ov, close);
  }
  function paint() {
    if (!ov) return;
    var c = cfg(), x = t(), k = x[c.kind], l = lang();
    var q = function (s) { return ov.querySelector(s); };
    q("#ysub-title").textContent = k.title;
    q("#ysub-close").setAttribute("aria-label", x.close); q("#ysub-close").title = x.close;
    q("#ysub-lead").textContent = x.lead;
    q("#ysub-tab-agent").textContent = x.tabAgent; q("#ysub-tab-mail").textContent = x.tabMail;
    ["agent", "mail"].forEach(function (n) {
      var b = q("#ysub-tab-" + n), p = q("#ysub-p-" + n), sel = tab === n;
      b.setAttribute("aria-selected", sel ? "true" : "false"); b.tabIndex = sel ? 0 : -1; p.hidden = !sel;
    });
    q("#ysub-prompt").textContent = typeof c.prompt === "function" ? (c.prompt(l) || "") : "";
    q("#ysub-note").textContent = k.note;
    var cp = q("#ysub-copy"); if (!cp.classList.contains("ok")) setCopyLabel(cp, false);
    var cm = q("#ysub-copy-mail"); cm.setAttribute("data-aria", x.copyMail); cm.title = x.copyMail; if (!cm.classList.contains("ok")) setCopyLabel(cm, false);
    var href = mailHref(), a = q("#ysub-addr"); a.textContent = EMAIL; a.href = href;
    var s = q("#ysub-send"); s.href = href; s.textContent = "✉️ " + x.openMail;
    q("#ysub-mail-note").textContent = x.mailNote;
  }
  function open() { if (!ov) build(); tab = "agent"; paint(); var pre = ov.querySelector("#ysub-prompt"); pre.scrollTop = 0; ov.classList.add("open"); }
  function close() { if (ov) ov.classList.remove("open"); }

  /* ---------- subscribe modal (#ovl, markup owned by the page) ---------- */
  var sub = d.getElementById("ovl");
  function paintSub() {
    if (!sub) return; var x = t();
    var cl = d.getElementById("mclose1"); if (cl) { cl.textContent = "✕"; cl.setAttribute("aria-label", x.close); cl.title = x.close; }
    var cp = d.getElementById("mcopy"); if (cp && !cp.classList.contains("ok")) setCopyLabel(cp, false);
    var ex = d.getElementById("mex-sum"); if (ex) ex.textContent = x.ex;
  }
  if (sub) shell(sub, function () { if (typeof window.closeModal === "function") window.closeModal(); else sub.classList.remove("open"); });
  paintSub();

  if (window.YL && YL.onLang) YL.onLang(function () { setTimeout(function () { paint(); paintSub(); }, 0); });
  window.YLSubmit = { open: open, close: close, copy: copy, paint: function () { paint(); paintSub(); } };
})();
