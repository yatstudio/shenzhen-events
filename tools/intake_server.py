#!/usr/bin/env python3
"""Yat's List open-submission intake.

Single-file, stdlib only. Listens on 127.0.0.1:8791 behind nginx.
POST /v1/events -> validate basics, honeypot, rate limit, append JSONL queue.
Storage: /srv/yatslist-intake/submissions.jsonl (one JSON object per line).
Review happens elsewhere (maintainer agent pulls the file over SSH).
"""
import json
import os
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

CST = timezone(timedelta(hours=8))
DATA_DIR = os.environ.get("INTAKE_DIR", "/srv/yatslist-intake")
QUEUE = os.path.join(DATA_DIR, "submissions.jsonl")
REVIEWS = os.path.join(DATA_DIR, "event_reviews.json")
XQUEUE = os.path.join(DATA_DIR, "xlist.jsonl")
TOKEN_FILE = os.path.join(DATA_DIR, "admin_token.txt")
XPEOPLE_FILE = os.path.join(DATA_DIR, "xpeople.json")
MAX_BODY = 32768
RATE_HOUR = 10
RATE_DAY = 40

_lock = threading.Lock()
_hits = {}  # ip -> [timestamps]


def rate_ok(ip):
    now = time.time()
    with _lock:
        ts = [t for t in _hits.get(ip, []) if now - t < 86400]
        if len([t for t in ts if now - t < 3600]) >= RATE_HOUR:
            _hits[ip] = ts
            return False
        if len(ts) >= RATE_DAY:
            _hits[ip] = ts
            return False
        ts.append(now)
        _hits[ip] = ts
        return True


XCATS = ["AI", "硬件", "出海", "Web3", "加密", "创业", "创作者", "投资", "其他"]
XRELS = ["AI 从业者", "AI 创业者", "投资人", "内容创作者", "研究者 / 学生", "AI 爱好者"]

XFORM_HTML = '<!DOCTYPE html>\n<html lang="zh-CN"><head><meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>加入 AI X List · Yat\'s List</title>\n<style>\nbody{background:#0d1218;color:#e6edf3;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;margin:0;padding:24px 16px 48px}\n.wrap{max-width:560px;margin:0 auto}\n.brand{font-family:ui-monospace,Menlo,monospace;color:#2ee6a8;font-weight:700;font-size:1.25rem}\nh1{font-size:1.6rem;margin:14px 0 6px}\n.sub{color:#8b98a5;line-height:1.65;margin:0 0 22px}\nlabel{display:block;margin:18px 0 7px;font-weight:600}\ninput[type=text]{width:100%;box-sizing:border-box;background:#10151b;border:1px solid rgba(255,255,255,.14);border-radius:10px;color:#e6edf3;padding:12px 14px;font-size:1rem}\n.hint{color:#6a737d;font-size:.85rem;margin-top:6px;line-height:1.55}\n.cats label,.rels label{display:inline-flex;align-items:center;gap:6px;font-weight:400;background:#10151b;border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:7px 14px;margin:0 8px 8px 0;cursor:pointer}\n.consent{display:flex;gap:9px;align-items:flex-start;background:#10151b;border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:13px 14px;line-height:1.55;font-weight:400}\nbutton{margin-top:24px;width:100%;background:#2ee6a8;color:#06130d;border:0;border-radius:999px;padding:14px;font-size:1.05rem;font-weight:700;cursor:pointer}\n.msg{margin-top:18px;line-height:1.6;display:none}\n.overlay{position:fixed;inset:0;background:rgba(3,6,9,.75);display:none;align-items:center;justify-content:center;padding:18px;z-index:50}\n.overlay.show{display:flex}\n.dlg{background:#10151b;border:1px solid rgba(46,230,168,.5);border-radius:16px;max-width:520px;width:100%;padding:26px 24px;box-sizing:border-box}\n.dlg h2{margin:0 0 6px;font-size:1.5rem}\n.dlg .sum{background:#0d1218;border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:12px 14px;line-height:1.75;margin:14px 0;word-break:break-all}\n.dlg .row{display:flex;gap:10px;flex-wrap:wrap}\n.dlg button{margin-top:8px;flex:1;width:auto}\n.btn2{background:transparent;color:#2ee6a8;border:1.5px solid #2ee6a8}\na{color:#2ee6a8}\n.hp{position:absolute;left:-9999px;top:-9999px}\n</style></head><body><div class="wrap">\n<div class="brand">&gt; yat\'s list_</div>\n<h1>把自己加进 AI X List</h1>\n<p class="sub">不用注册。一分钟填完，提交后我们轻核一遍就上榜；你的头像会自动从 X 拉取，不用上传。</p>\n<form id="f">\n<label for="handle">你的 X 账号 *</label>\n<input type="text" id="handle" placeholder="@yatbtc，或 x.com/yatbtc" autocomplete="off">\n<label>你的分类（可多选）*</label>\n<div class="cats" id="cats"></div>\n<label for="intro">自我介绍（选填，但建议写细一点）</label>\n<input type="text" id="intro" maxlength="160" placeholder="例：做 AI 硬件出海，擅长供应链和海外众筹，常驻南山，想找硬件创业者与海外渠道">\n<label for="github">GitHub 地址（选填）</label>\n<input type="text" id="github" maxlength="120" placeholder="例：github.com/你的用户名">\n<p class="hint">这段介绍会同时给人和 Agent 看：写清你做什么、擅长什么、能帮别人什么、想找什么人，再带上常驻区域（如南山、宝安），别人和 Agent 才更容易找到你。最多 160 字。不填就用你 X 简介的第一句。</p>\n<label>你的身份 *</label>\n<div class="rels" id="rels"></div>\n<label class="consent"><input type="checkbox" id="consent" style="margin-top:4px"><span>这是我自己的账号，我同意公开列入 X List（随时可邮件 yat@yatslist.com 下榜）</span></label>\n<input type="text" id="website" class="hp" tabindex="-1" autocomplete="off">\n<button type="submit" id="btn">提交，上榜</button>\n<p class="msg" id="msg"></p>\n</form>\n<p class="hint" style="margin-top:26px">提交后去 <a href="https://yatslist.com/xlist/">X List 页</a> 看看，明天更新后你就在上面了。</p>\n<div class="overlay" id="okOverlay"><div class="dlg">\n<h2>✅ 提交成功</h2>\n<p class="sub" style="margin:0">已经收到你的提交，编号 <b id="okId"></b>。轻核通过后就会上榜，你提交的内容是：</p>\n<div class="sum" id="okSum"></div>\n<p class="hint">不满意？点「继续编辑」改完再提交一次，同一账号以最新一次为准。</p>\n<div class="row"><button type="button" id="okDone">就这样</button><button type="button" id="okEdit" class="btn2">继续编辑，再提交一次</button></div>\n</div></div>\n</div>\n<script>\nvar CATS=["AI","硬件","出海","Web3","加密","创业","创作者","投资","其他"];\nvar RELS=["AI 从业者","AI 创业者","投资人","内容创作者","研究者 / 学生","AI 爱好者"];\ndocument.getElementById("cats").innerHTML=CATS.map(function(c){return \'<label><input type="checkbox" name="cat" value="\'+c+\'">\'+c+\'</label>\'}).join("");\ndocument.getElementById("rels").innerHTML=RELS.map(function(r,i){return \'<label><input type="radio" name="rel" value="\'+r+\'"\'+(i===0?" checked":"")+\'>\'+r+\'</label>\'}).join("");\nfunction esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}\nfunction showOk(d,p){\n  document.getElementById("okId").textContent=d.id;\n  document.getElementById("okSum").innerHTML="X 账号：@"+esc(p.handle.replace(/^@+/,""))+"<br>分类："+esc(p.cats.join("、"))+"<br>自我介绍："+esc(p.intro||"（没填，上榜时用 X 简介第一句）")+(p.github?"<br>GitHub："+esc(p.github):"")+"<br>身份："+esc(p.rel);\n  document.getElementById("okOverlay").classList.add("show");\n}\ndocument.getElementById("okDone").addEventListener("click",function(){document.getElementById("okOverlay").classList.remove("show")});\ndocument.getElementById("okEdit").addEventListener("click",function(){document.getElementById("okOverlay").classList.remove("show");var b=document.getElementById("btn");b.disabled=false;b.textContent="重新提交";document.getElementById("handle").focus()});\ndocument.getElementById("f").addEventListener("submit",function(e){\n  e.preventDefault();\n  var msg=document.getElementById("msg"); msg.style.display="block";\n  var handle=document.getElementById("handle").value.trim();\n  var cats=[].slice.call(document.querySelectorAll("input[name=cat]:checked")).map(function(x){return x.value});\n  var rel=(document.querySelector("input[name=rel]:checked")||{}).value||"";\n  var consent=document.getElementById("consent").checked;\n  if(!handle){msg.textContent="先填你的 X 账号。";return}\n  if(!cats.length){msg.textContent="至少选一个分类。";return}\n  if(!consent){msg.textContent="要先勾选确认：这是你自己的账号。";return}\n  var btn=document.getElementById("btn"); btn.disabled=true; btn.textContent="提交中…";\n  fetch("/v1/xlist",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({channel:"web",website:document.getElementById("website").value,person:{handle:handle,categories:cats,intro:document.getElementById("intro").value.trim(),github:document.getElementById("github").value.trim(),relation:rel,consent:true}})})\n  .then(function(r){return r.json()}).then(function(d){\n    if(d&&d.status==="queued_for_review"){msg.innerHTML="✅ 收到了（编号 "+d.id+"）。轻核通过后上榜，明天打开 <a href=\'https://yatslist.com/xlist/\'>X List 页</a> 就能看到你。";btn.textContent="已提交";showOk(d,{handle:handle,cats:cats,intro:document.getElementById("intro").value.trim(),github:document.getElementById("github").value.trim(),rel:rel})}\n    else{msg.textContent="没提交成功："+((d&&d.error)||"请稍后再试");btn.disabled=false;btn.textContent="提交，上榜"}\n  }).catch(function(){msg.textContent="网络出错，请稍后再试。";btn.disabled=false;btn.textContent="提交，上榜"});\n});\n</script></body></html>\n'


def append_queue(record):
    with _lock:
        with open(QUEUE, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")


def append_xqueue(record):
    with _lock:
        with open(XQUEUE, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")


_REVIEWS_LOCK = threading.Lock()

def _read_reviews():
    try:
        with open(REVIEWS, encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}

def _update_review(sub_id, fields):
    with _REVIEWS_LOCK:
        d = _read_reviews()
        rec = d.get(sub_id) or {}
        rec.update(fields)
        d[sub_id] = rec
        tmp = REVIEWS + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, indent=1)
        os.replace(tmp, REVIEWS)
    return rec

ADMIN_HTML = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="robots" content="noindex, nofollow">\n<title>审核台 · Yat\'s List</title>\n<style>\n:root{--bg:#0d1218;--panel:#131a22;--border:#22303d;--ink:#e8f0ec;--sec:#93a5ad;--green:#2ee6a8;--red:#ff7a7a}\n*{box-sizing:border-box}\nbody{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.55}\n.wrap{max-width:860px;margin:0 auto;padding:28px 18px 60px}\nh1{font-size:1.5rem;margin:0 0 4px}\n.sub{color:var(--sec);margin:0 0 22px}\n.tabs{display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap}\n.tab{background:var(--panel);border:1px solid var(--border);color:var(--ink);border-radius:999px;padding:8px 18px;cursor:pointer;font-size:.95rem}\n.tab.on{border-color:var(--green);color:var(--green)}\n.card{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:16px 18px;margin-bottom:12px;display:flex;gap:14px;align-items:flex-start}\n.card img{width:52px;height:52px;border-radius:50%;background:#22303d}\n.who{flex:1;min-width:0}\n.who b{font-size:1.05rem}\n.who a{color:var(--sec);text-decoration:none}\n.intro{margin:4px 0;color:var(--ink)}\n.meta{color:var(--sec);font-size:.85rem}\n.chip{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:1px 10px;margin-right:6px;font-size:.8rem;color:var(--sec)}\n.acts{display:flex;flex-direction:column;gap:8px}\n.btn{border-radius:999px;padding:9px 20px;font-weight:700;cursor:pointer;border:1.5px solid var(--green);background:var(--green);color:#06130d;font-size:.92rem}\n.btn.no{background:transparent;color:var(--red);border-color:var(--red)}\n.btn:disabled{opacity:.45;cursor:default}\n.empty{color:var(--sec);padding:34px 0;text-align:center}\n#gate{max-width:420px;margin:12vh auto 0;background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:26px}\n#gate input{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:10px;color:var(--ink);padding:12px;font-size:1rem;margin:10px 0 14px}\n.note{color:var(--sec);font-size:.88rem}\n</style>\n</head>\n<body>\n<div class="wrap">\n  <div id="gate" style="display:none">\n    <h1>审核台口令</h1>\n    <p class="note">这个页面只有维护者能用。口令在 VMISS 服务器上，只问一次、记在本机浏览器。</p>\n    <input type="password" id="tok" placeholder="输入口令">\n    <button class="btn" style="width:100%" onclick="saveTok()">进入审核台</button>\n    <p class="note" id="gate-msg"></p>\n  </div>\n  <div id="main" style="display:none">\n    <h1>Yat\'s List · 审核台</h1>\n    <p class="sub">点「通过」后约 20 分钟内自动上榜（有定时任务专门处理已通过的申请）；点「拒绝」的不会上榜。什么都不点也行，每日任务会轻核其余申请。</p>\n    <div class="tabs">\n      <button class="tab on" data-s="pending" onclick="setTab(\'pending\')">待审</button>\n      <button class="tab" data-s="approved" onclick="setTab(\'approved\')">已通过（待上榜）</button>\n      <button class="tab" data-s="rejected" onclick="setTab(\'rejected\')">已拒绝</button>\n    </div>\n    <div id="list"></div>\n    <h1 style="margin-top:38px">活动投稿 · API 队列</h1>\n    <p class="sub">通过 API 提交进来的活动投稿，最新在前。每日 07:30 更新时逐条核实、去重后决定收录；这里只看，不处理。</p>\n    <div id="evlist"></div>\n  </div>\n</div>\n<script>\n(function(){try{var t=new URLSearchParams(location.search).get("t");if(t){localStorage.setItem("xadmin_tok",t.trim());history.replaceState(null,"",location.pathname);}}catch(e){}})();\nlet TAB="pending", ITEMS=[];\nfunction tok(){return localStorage.getItem("xadmin_tok")||""}\nfunction saveTok(){localStorage.setItem("xadmin_tok",document.getElementById("tok").value.trim());load()}\nasync function api(path,opt){\n  const r=await fetch(path,Object.assign({headers:{"Content-Type":"application/json","X-Admin-Token":tok()}},opt||{}));\n  if(r.status===401){document.getElementById("main").style.display="none";document.getElementById("gate").style.display="block";document.getElementById("gate-msg").textContent="口令不对，再试一次。";throw new Error("401")}\n  return r.json();\n}\nasync function load(){\n  if(!tok()){document.getElementById("gate").style.display="block";return}\n  const d=await api("/v1/admin/xlist");\n  ITEMS=d.items||[];\n  document.getElementById("gate").style.display="none";\n  document.getElementById("main").style.display="block";\n  render();\n  loadEvents();\n}\nfunction setTab(s){TAB=s;document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("on",b.dataset.s===s));render()}\nfunction ghUrl(g){g=String(g||\'\').trim(); if(/^https?:\\/\\//.test(g)) return g; g=g.replace(/^@+/,\'\').replace(/^github\\.com\\//,\'\'); return \'https://github.com/\'+g;}\nfunction esc(x){return String(x==null?"":x).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",\'"\':"&quot;"}[c]))}\nfunction render(){\n  const rows=ITEMS.filter(x=>x.status===TAB);\n  const el=document.getElementById("list");\n  if(!rows.length){el.innerHTML=\'<p class="empty">这里没有记录。</p>\';return}\n  el.innerHTML=rows.map(x=>{\n    const p=x.person||{};\n    const chips=(p.categories||[]).map(c=>\'<span class="chip">\'+esc(c)+"</span>").join("");\n    const acts=TAB==="pending"?\'<div class="acts"><button class="btn" onclick="act(\\\'\'+x.id+\'\\\',\\\'approve\\\',this)">通过</button><button class="btn no" onclick="act(\\\'\'+x.id+\'\\\',\\\'reject\\\',this)">拒绝</button></div>\':"";\n    return \'<div class="card"><img src="https://unavatar.io/x/\'+esc(p.handle)+\'" onerror="this.remove()"><div class="who"><b>@\'+esc(p.handle)+\'</b> <a href="https://x.com/\'+esc(p.handle)+\'" target="_blank" rel="noopener">打开主页 ↗</a><p class="intro">\'+esc(p.intro||"（没填自我介绍）")+\'</p><div>\'+chips+\'</div>\'+(p.github?\'<p class="meta">GitHub：<a href="\'+esc(ghUrl(p.github))+\'" target="_blank" rel="noopener">\'+esc(p.github)+\'</a></p>\':"")+\'<p class="meta">\'+esc(p.relation||"")+" · "+esc(x.received_at||"")+" · 渠道 "+esc(x.channel||"")+(x.reviewed_at?" · 处理于 "+esc(x.reviewed_at):"")+"</p></div>"+acts+"</div>";\n  }).join("");\n}\nasync function act(id,what,btn){\n  btn.disabled=true;\n  await api("/v1/admin/xlist/"+what,{method:"POST",body:JSON.stringify({id:id})});\n  load();\n}\nasync function loadEvents(){\n  try{\n    const d=await api("/v1/admin/events");\n    const el=document.getElementById("evlist");\n    if(!el)return;\n    const items=d.items||[];\n    const reviews=d.reviews||{};\n    if(!items.length){el.innerHTML="<p class=\'note\'>队列是空的，还没有投稿进来。</p>";return}\n    el.innerHTML=items.map(function(x){\n      const e=(x.payload&&x.payload.event)||{};\n      const r=reviews[x.id]||{};\n      const meta=[e.start,e.venue,e.district].filter(Boolean).map(esc).join(" · ");\n      let badge="";\n      if(r.human==="approved")badge="<p class=\'meta\' style=\'color:var(--green)\'>你已通过 · 等每日更新收录</p>";\n      else if(r.human==="rejected")badge="<p class=\'meta\' style=\'color:var(--red)\'>你已拒绝</p>";\n      else if(r.verdict==="listed")badge="<p class=\'meta\' style=\'color:var(--green)\'>AI 初审：已收录"+(r.reason?" · "+esc(r.reason):"")+"</p>";\n      else if(r.verdict==="rejected")badge="<p class=\'meta\' style=\'color:var(--red)\'>AI 初审：已拒绝"+(r.reason?" · "+esc(r.reason):"")+"</p>";\n      else if(r.verdict==="pending_human")badge="<p class=\'meta\' style=\'color:#ffb454\'>待你审核："+esc(r.reason||"AI 拿不准")+"</p>";\n      else badge="<p class=\'meta\'>待 AI 初审（每日 07:30 处理）</p>";\n      let acts="<div style=\'margin-top:8px;display:flex;gap:10px\'><button class=\'btn\' onclick=\\"decide(\'"+x.id+"\',\'approved\',this)\\">通过</button><button class=\'btn\' onclick=\\"decide(\'"+x.id+"\',\'rejected\',this)\\">拒绝</button></div>";\n      }\n      return "<div class=\'card\'><p style=\'margin:0 0 4px\'><b>"+esc(e.title||"(无标题)")+"</b></p>"\n        +(meta?"<p class=\'meta\'>"+meta+"</p>":"")\n        +"<p class=\'meta\'>渠道 "+esc(x.channel||"")+" · 收到 "+esc(x.received_at||"")+" · 编号 "+esc(x.id||"")+"</p>"\n        +(e.url?"<p style=\'margin:4px 0\'><a href=\'"+esc(e.url)+"\' target=\'_blank\' rel=\'noopener\'>"+esc(e.url)+"</a></p>":"")\n        +(e.summary?"<p style=\'margin:4px 0\'>"+esc(e.summary)+"</p>":"")\n        +badge+acts+"</div>";\n    }).join("");\n  }catch(err){}\n}\nasync function decide(id,what,btn){\n  btn.disabled=true;\n  await api("/v1/admin/events/decide",{method:"POST",body:JSON.stringify({id:id,decision:what})});\n  loadEvents();\n}\nload();\n</script>\n</body>\n</html>\n'


def _admin_token():
    try:
        with open(TOKEN_FILE, encoding="utf-8") as f:
            return f.read().strip()
    except Exception:
        return ""


def _read_xqueue():
    items = []
    try:
        with open(XQUEUE, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        items.append(json.loads(line))
                    except Exception:
                        pass
    except FileNotFoundError:
        pass
    return items


def _write_xqueue(items):
    tmp = XQUEUE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        for it in items:
            f.write(json.dumps(it, ensure_ascii=False) + "\n")
    os.replace(tmp, XQUEUE)


def _read_xpeople():
    try:
        with open(XPEOPLE_FILE, encoding="utf-8") as f:
            d = json.load(f)
        if isinstance(d, dict) and isinstance(d.get("people"), list):
            return d["people"]
    except Exception:
        pass
    return []


def _write_xpeople(people):
    tmp = XPEOPLE_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"people": people}, f, ensure_ascii=False, indent=1)
    os.replace(tmp, XPEOPLE_FILE)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass

    def _send(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send(204, {})

    def _send_html(self, code, html):
        body = html.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self._path_only() in ("/xlist", "/xlist/"):
            self._send_html(200, XFORM_HTML)
        elif self._path_only() in ("/admin", "/admin/"):
            if self._admin_ok():
                self._send_html(200, ADMIN_HTML)
            else:
                self._send(401, {"error": "admin_token_required", "hint": "open with ?t=<token> once"})
        elif self._path_only() == "/health":
            self._send(200, {"ok": True})
        elif self._path_only() == "/v1/admin/xlist":
            if not self._admin_ok():
                self._send(401, {"error": "unauthorized"})
            else:
                items = _read_xqueue()
                items = [{k: v for k, v in it.items() if k != "ip"} for it in items]
                self._send(200, {"items": items, "count": len(items)})
        elif self._path_only() == "/v1/admin/events":
            if not self._admin_ok():
                self._send(401, {"error": "unauthorized"})
            else:
                items = []
                try:
                    with open(QUEUE, encoding="utf-8") as f:
                        for ln in f:
                            ln = ln.strip()
                            if ln:
                                try:
                                    items.append(json.loads(ln))
                                except Exception:
                                    pass
                except FileNotFoundError:
                    pass
                items = [{k: v for k, v in it.items() if k != "ip"} for it in items]
                items.reverse()
                self._send(200, {"items": items, "count": len(items), "reviews": _read_reviews()})
        elif self._path_only() == "/v1/admin/xpeople":
            if not self._admin_ok():
                self._send(401, {"error": "unauthorized"})
            else:
                self._send(200, {"people": _read_xpeople()})
        elif self._path_only() in ("/", "/v1", "/v1/"):
            self._send(200, {
                "service": "Yat's List submission intake",
                "protocol": "https://yatslist.com/SUBMIT.md",
                "submit": "POST /v1/events",
                "xlist_submit": "POST /v1/xlist",
                "xlist_form": "GET /xlist",
                "xlist_admin": "GET /admin (token required)",
            })
        else:
            self._send(404, {"error": "not_found"})

    def _post_xlist(self):
        import re as _re
        ip = self.headers.get("X-Real-IP") or self.client_address[0]
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY:
            self._send(413, {"error": "body_size"})
            return
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except Exception:
            self._send(400, {"error": "invalid_json"})
            return
        if not isinstance(payload, dict):
            self._send(400, {"error": "invalid_payload"})
            return
        if payload.get("website"):
            self._send(400, {"error": "rejected"})
            return
        p = payload.get("person")
        if not isinstance(p, dict):
            self._send(400, {"error": "missing_person"})
            return
        handle = str(p.get("handle") or "").strip()
        handle = _re.sub(r"^(https?://)?(www\.)?(x\.com|twitter\.com)/", "", handle)
        handle = handle.lstrip("@").split("/")[0].split("?")[0].strip()
        if not _re.fullmatch(r"[A-Za-z0-9_]{1,15}", handle or ""):
            self._send(400, {"error": "invalid_handle"})
            return
        cats = p.get("categories")
        if not isinstance(cats, list) or not cats:
            self._send(400, {"error": "missing_categories"})
            return
        cats = [str(c)[:20] for c in cats if str(c) in XCATS]
        if not cats:
            self._send(400, {"error": "invalid_categories"})
            return
        relation = str(p.get("relation") or "")
        if relation not in XRELS:
            self._send(400, {"error": "invalid_relation"})
            return
        if p.get("consent") is not True:
            self._send(400, {"error": "consent_required"})
            return
        intro = str(p.get("intro") or "").replace("<", "").replace(">", "").strip()[:160]
        github = str(p.get("github") or "").replace("<", "").replace(">", "").replace(" ", "").strip()[:120]
        if not rate_ok(ip):
            self._send(429, {"error": "rate_limited"})
            return
        sid = "x-" + secrets.token_hex(6)
        record = {
            "id": sid,
            "received_at": datetime.now(CST).strftime("%Y-%m-%dT%H:%M:%S+08:00"),
            "ip": ip,
            "channel": payload.get("channel") or "web",
            "status": "pending",
            "person": {"handle": handle, "categories": cats, "intro": intro,
                       "github": github, "relation": relation, "consent": True},
        }
        try:
            append_xqueue(record)
        except Exception as e:
            self._send(500, {"error": "storage", "detail": str(e)[:100]})
            return
        self._send(202, {"id": sid, "status": "queued_for_review"})

    def _admin_ok(self):
        tok = _admin_token()
        if not tok:
            return False
        given = self.headers.get("X-Admin-Token") or ""
        if given and secrets.compare_digest(given, tok):
            return True
        try:
            from urllib.parse import urlparse, parse_qs
            q = parse_qs(urlparse(self.path).query)
            cand = (q.get("t") or [""])[0]
        except Exception:
            cand = ""
        return bool(cand) and secrets.compare_digest(cand, tok)

    def _path_only(self):
        from urllib.parse import urlparse
        return urlparse(self.path).path

    def _admin_xlist_set(self, new_status):
        if not self._admin_ok():
            self._send(401, {"error": "unauthorized"})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY:
            self._send(413, {"error": "body_size"})
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            self._send(400, {"error": "invalid_json"})
            return
        rid = str(payload.get("id") or "")
        if not rid:
            self._send(400, {"error": "missing_id"})
            return
        with _lock:
            items = _read_xqueue()
            found = None
            for it in items:
                if it.get("id") == rid:
                    it["status"] = new_status
                    it["reviewed_at"] = datetime.now(CST).strftime("%Y-%m-%dT%H:%M:%S+08:00")
                    it["reviewed_via"] = "admin-page"
                    found = it
                    break
            if found is None:
                self._send(404, {"error": "not_found"})
                return
            _write_xqueue(items)
        self._send(200, {"id": rid, "status": new_status})

    def _admin_xpeople(self):
        if not self._admin_ok():
            self._send(401, {"error": "unauthorized"})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > 262144:
            self._send(413, {"error": "body_size"})
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            self._send(400, {"error": "invalid_json"})
            return
        people = payload.get("people")
        if not isinstance(people, list):
            self._send(400, {"error": "missing_people"})
            return
        with _lock:
            _write_xpeople(people)
        self._send(200, {"ok": True, "count": len(people)})


    def _admin_event_review(self, who):
        if not self._admin_ok():
            self._send(401, {"error": "unauthorized"})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY:
            self._send(413, {"error": "body_size"})
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            self._send(400, {"error": "invalid_json"})
            return
        sub_id = str(payload.get("id") or "")
        if not sub_id:
            self._send(400, {"error": "id_required"})
            return
        now = datetime.now(CST).strftime("%Y-%m-%dT%H:%M:%S+08:00")
        if who == "agent":
            verdict = str(payload.get("verdict") or "")
            if verdict not in ("listed", "rejected", "pending_human"):
                self._send(400, {"error": "bad_verdict"})
                return
            rec = _update_review(sub_id, {"verdict": verdict, "reason": str(payload.get("reason") or "")[:300], "by": "agent", "at": now})
        else:
            decision = str(payload.get("decision") or "")
            if decision not in ("approved", "rejected"):
                self._send(400, {"error": "bad_decision"})
                return
            rec = _update_review(sub_id, {"human": decision, "human_at": now})
        self._send(200, {"ok": True, "id": sub_id, "review": rec})

    def do_POST(self):
        if self._path_only() == "/v1/admin/xlist/approve":
            self._admin_xlist_set("approved")
            return
        if self._path_only() == "/v1/admin/xlist/reject":
            self._admin_xlist_set("rejected")
            return
        if self._path_only() == "/v1/admin/xpeople":
            self._admin_xpeople()
            return
        if self._path_only() == "/v1/admin/events/verdict":
            self._admin_event_review("agent")
            return
        if self._path_only() == "/v1/admin/events/decide":
            self._admin_event_review("human")
            return
        if self._path_only() == "/v1/xlist":
            self._post_xlist()
            return
        if self._path_only() != "/v1/events":
            self._send(404, {"error": "not_found"})
            return
        ip = self.headers.get("X-Real-IP") or self.client_address[0]
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY:
            self._send(413, {"error": "body_size"})
            return
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except Exception:
            self._send(400, {"error": "invalid_json"})
            return
        if not isinstance(payload, dict):
            self._send(400, {"error": "invalid_payload"})
            return
        # honeypot: field must be present-but-empty or absent; any content = bot
        if payload.get("website"):
            self._send(400, {"error": "rejected"})
            return
        ev = payload.get("event")
        if not isinstance(ev, dict):
            self._send(400, {"error": "missing_event"})
            return
        missing = [k for k in ("title", "url") if not ev.get(k)]
        if missing:
            self._send(400, {"error": "missing_fields", "fields": missing})
            return
        url = str(ev.get("url", ""))
        if not (url.startswith("http://") or url.startswith("https://")):
            self._send(400, {"error": "invalid_url"})
            return
        if not rate_ok(ip):
            self._send(429, {"error": "rate_limited"})
            return
        sid = "sub-" + secrets.token_hex(6)
        record = {
            "id": sid,
            "received_at": datetime.now(CST).strftime("%Y-%m-%dT%H:%M:%S+08:00"),
            "ip": ip,
            "channel": payload.get("channel") or "agent",
            "status": "pending",
            "payload": payload,
        }
        try:
            append_queue(record)
        except Exception as e:
            self._send(500, {"error": "storage", "detail": str(e)[:100]})
            return
        self._send(202, {"id": sid, "status": "queued_for_review"})


if __name__ == "__main__":
    os.makedirs(DATA_DIR, exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", 8791), Handler)
    print("intake listening on 127.0.0.1:8791", flush=True)
    server.serve_forever()
