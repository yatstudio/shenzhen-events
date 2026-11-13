#!/usr/bin/env python3
"""Yat's List open-submission intake.

Single-file, stdlib only. Listens on 127.0.0.1:8791 behind nginx.
POST /v1/events -> validate basics, honeypot, rate limit, append JSONL queue.
Storage: /srv/yatslist-intake/submissions.jsonl (one JSON object per line).
Review happens elsewhere (maintainer agent pulls the file over SSH).
"""
import hashlib
import html
import json
import os
import re
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

CST = timezone(timedelta(hours=8))
DATA_DIR = os.environ.get("INTAKE_DIR", "/srv/yatslist-intake")
QUEUE = os.path.join(DATA_DIR, "submissions.jsonl")
REVIEWS = os.path.join(DATA_DIR, "event_reviews.json")
JQUEUE = os.path.join(DATA_DIR, "jobs.jsonl")
JREVIEWS = os.path.join(DATA_DIR, "job_reviews.json")
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


def append_jqueue(record):
    with _lock:
        with open(JQUEUE, "a", encoding="utf-8") as f:
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
        for k, v in fields.items():
            if v is None:
                rec.pop(k, None)
            else:
                rec[k] = v
        d[sub_id] = rec
        tmp = REVIEWS + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, indent=1)
        os.replace(tmp, REVIEWS)
    return rec


_JREVIEWS_LOCK = threading.Lock()

def _read_jreviews():
    try:
        with open(JREVIEWS, encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}

def _update_jreview(job_id, fields):
    with _JREVIEWS_LOCK:
        d = _read_jreviews()
        rec = d.get(job_id) or {}
        for k, v in fields.items():
            if v is None:
                rec.pop(k, None)
            else:
                rec[k] = v
        d[job_id] = rec
        tmp = JREVIEWS + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, indent=1)
        os.replace(tmp, JREVIEWS)
    return rec


_SUB_ID_RE = re.compile(r"^sub-[0-9a-f]+$")
_JOB_ID_RE = re.compile(r"^job-[0-9a-f]+$")

def _find_submission(sub_id):
    try:
        with open(QUEUE, encoding="utf-8") as f:
            for ln in f:
                ln = ln.strip()
                if not ln:
                    continue
                try:
                    rec = json.loads(ln)
                except Exception:
                    continue
                if rec.get("id") == sub_id:
                    return rec
    except FileNotFoundError:
        pass
    return None

def _find_job(job_id):
    try:
        with open(JQUEUE, encoding="utf-8") as f:
            for ln in f:
                ln = ln.strip()
                if not ln:
                    continue
                try:
                    rec = json.loads(ln)
                except Exception:
                    continue
                if rec.get("id") == job_id:
                    return rec
    except FileNotFoundError:
        pass
    return None

def _hash_edit_key(key):
    return hashlib.sha256(str(key).encode("utf-8")).hexdigest()


def _update_submission(sub_id, fields):
    with _lock:
        try:
            with open(QUEUE, encoding="utf-8") as f:
                lines = f.readlines()
        except FileNotFoundError:
            return None
        out, found = [], None
        for ln in lines:
            s = ln.strip()
            rec = None
            if s:
                try:
                    rec = json.loads(s)
                except Exception:
                    rec = None
            if rec is not None and rec.get("id") == sub_id:
                rec.update(fields)
                found = rec
                out.append(json.dumps(rec, ensure_ascii=False) + "\n")
            else:
                out.append(ln if ln.endswith("\n") else ln + "\n")
        if found is None:
            return None
        tmp = QUEUE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.writelines(out)
        os.replace(tmp, QUEUE)
    return found


def _update_job_record(job_id, fields):
    with _lock:
        try:
            with open(JQUEUE, encoding="utf-8") as f:
                lines = f.readlines()
        except FileNotFoundError:
            return None
        out, found = [], None
        for ln in lines:
            s = ln.strip()
            rec = None
            if s:
                try:
                    rec = json.loads(s)
                except Exception:
                    rec = None
            if rec is not None and rec.get("id") == job_id:
                rec.update(fields)
                found = rec
                out.append(json.dumps(rec, ensure_ascii=False) + "\n")
            else:
                out.append(ln if ln.endswith("\n") else ln + "\n")
        if found is None:
            return None
        tmp = JQUEUE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.writelines(out)
        os.replace(tmp, JQUEUE)
    return found


def _derive_status(review):
    if not review:
        return "queued_for_review"
    if review.get("human") == "rejected":
        return "rejected"
    if review.get("verdict") == "withdrawn":
        return "withdrawn"
    if review.get("verdict") == "listed":
        return "listed"
    if review.get("verdict") == "rejected":
        return "rejected"
    if review.get("human") == "approved":
        return "approved_pending_listing"
    if review.get("verdict") == "pending_human":
        return "pending_human"
    return "queued_for_review"

_STATUS_LABEL = {
    "queued_for_review": ("\u23f3 待初审", "每日 07:30 统一初审，请稍后再来查看结果。"),
    "listed": ("\u2705 已收录", "这条活动已收录进 Yat\u2019s List。"),
    "rejected": ("\u274c 已拒绝", ""),
    "pending_human": ("\U0001f550 待人工审核", "AI 初审拿不准，已转人工审核。"),
    "approved_pending_listing": ("\u2705 人工已通过 · 待收录", "已通过人工审核，将在下一次每日更新时收录。"),
    "withdrawn": ("\U0001f6ab 已撤回", "这条投稿已被投稿人撤回，不会再被处理。"),
}

def _preview_html(rec, review):
    esc = html.escape
    ev = ((rec.get("payload") or {}).get("event")) or {}
    status = _derive_status(review)
    label, note = _STATUS_LABEL.get(status, _STATUS_LABEL["queued_for_review"])
    reason = (review or {}).get("reason") or ""
    extra = ""
    if status == "rejected" and reason:
        extra = "<p class='why'>理由：" + esc(str(reason)) + "</p>"
    elif note:
        extra = "<p class='why'>" + esc(note) + "</p>"
    link_btn = ""
    if status == "listed":
        lu = (review or {}).get("listed_url") or "https://yatslist.com/szevents/"
        link_btn = "<p style='margin-top:14px'><a class='btn' href='" + esc(str(lu), quote=True) + "' target='_blank' rel='noopener'>在 Yat\u2019s List 查看 \u2197</a></p>"
    def row(k, v):
        if v:
            return "<p class='meta'><span class='k'>" + k + "</span>" + esc(str(v)) + "</p>"
        return ""
    when = str(ev.get("start") or "")
    if ev.get("end"):
        when = (when + " \u2013 " + str(ev["end"])) if when else str(ev["end"])
    place = " \u00b7 ".join(str(x) for x in (ev.get("venue"), ev.get("district")) if x)
    rows = row("时间", when) + row("地点", place) + row("费用", ev.get("fee")) + row("主办", ev.get("organizer"))
    url = str(ev.get("url") or "")
    if url:
        rows += "<p class='meta'><span class='k'>链接</span><a href='" + esc(url, quote=True) + "' target='_blank' rel='noopener'>" + esc(url) + "</a></p>"
    summary = ""
    if ev.get("summary"):
        summary = "<p class='sum'>" + esc(str(ev["summary"])) + "</p>"
    bcls = " bad" if status == "rejected" else (" wait" if status in ("queued_for_review", "pending_human") else "")
    return ("<!DOCTYPE html>\n<html lang='zh-CN'>\n<head>\n<meta charset='utf-8'>\n"
        "<meta name='viewport' content='width=device-width, initial-scale=1'>\n"
        "<meta name='robots' content='noindex, nofollow'>\n"
        "<title>投稿预览 · Yat\u2019s List</title>\n<style>\n"
        ":root{--bg:#0d1218;--panel:#131a22;--border:#22303d;--ink:#e8f0ec;--sec:#93a5ad;--green:#2ee6a8;--red:#ff7a7a}\n"
        "*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;line-height:1.6}\n"
        ".wrap{max-width:680px;margin:0 auto;padding:34px 18px 60px}\n"
        ".banner{border:1px solid var(--green);border-radius:14px;padding:16px 18px;margin-bottom:16px;background:var(--panel)}\n"
        ".banner.bad{border-color:var(--red)}.banner.wait{border-color:#ffb454}\n"
        ".banner b{font-size:1.15rem}.why{color:var(--sec);margin:6px 0 0;font-size:.92rem}\n"
        ".card{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:18px}\n"
        ".card h1{font-size:1.3rem;margin:0 0 10px;line-height:1.4}\n"
        ".meta{color:var(--sec);font-size:.92rem;margin:4px 0}.meta .k{display:inline-block;min-width:3.2em;color:var(--ink)}\n"
        ".meta a{color:var(--green);word-break:break-all}\n"
        ".sum{margin:12px 0 0;white-space:pre-wrap}\n"
        ".btn{display:inline-block;border-radius:999px;padding:9px 20px;font-weight:700;border:1.5px solid var(--green);background:var(--green);color:#06130d;text-decoration:none;font-size:.92rem}\n"
        "footer{color:var(--sec);font-size:.85rem;margin-top:26px;text-align:center}\n</style>\n</head>\n<body>\n<div class='wrap'>\n"
        "<div class='banner" + bcls + "'><b>" + esc(label) + "</b>" + extra + "</div>\n"
        "<div class='card'><h1>" + esc(str(ev.get("title") or "(无标题)")) + "</h1>" + rows + summary + link_btn + "</div>\n"
        "<p style='color:#ffb454;font-size:.9rem;margin-top:18px;line-height:1.65'>⚠️ 投稿人备忘：修改或撤回这条投稿，需要投稿时发放的 <b>edit_key</b>（只显示过一次，遗失无法找回）。请确认你已把它和编号一起存好。</p>\n"
        "<footer>Yat\u2019s List 投稿预览 · 编号 " + esc(str(rec.get("id") or "")) + "</footer>\n"
        "</div>\n</body>\n</html>\n")

def _preview_job_html(rec, review):
    esc = html.escape
    jb = ((rec.get("payload") or {}).get("job")) or {}
    status = _derive_status(review)
    label, note = _STATUS_LABEL.get(status, _STATUS_LABEL["queued_for_review"])
    reason = (review or {}).get("reason") or ""
    extra = ""
    if status == "rejected" and reason:
        extra = "<p class='why'>理由：" + esc(str(reason)) + "</p>"
    elif note:
        extra = "<p class='why'>" + esc(note) + "</p>"
    link_btn = ""
    if status == "listed":
        lu = (review or {}).get("listed_url") or "https://yatslist.com/jobs/"
        link_btn = "<p style='margin-top:14px'><a class='btn' href='" + esc(str(lu), quote=True) + "' target='_blank' rel='noopener'>在 Yat’s List 查看 ↗</a></p>"
    def row(k, v):
        if v:
            return "<p class='meta'><span class='k'>" + k + "</span>" + esc(str(v)) + "</p>"
        return ""
    tags = jb.get("tags")
    if isinstance(tags, list):
        tags = " / ".join(str(t) for t in tags)
    rows = row("公司", jb.get("company")) + row("地点", jb.get("district")) + row("类型", jb.get("type")) + row("薪资", jb.get("salary")) + row("方向", tags)
    url = str(jb.get("url") or "")
    if url:
        rows += "<p class='meta'><span class='k'>链接</span><a href='" + esc(url, quote=True) + "' target='_blank' rel='noopener'>" + esc(url) + "</a></p>"
    summary = ""
    if jb.get("summary"):
        summary = "<p class='sum'>" + esc(str(jb["summary"])) + "</p>"
    bcls = " bad" if status == "rejected" else (" wait" if status in ("queued_for_review", "pending_human") else "")
    return ("<!DOCTYPE html>\n<html lang='zh-CN'>\n<head>\n<meta charset='utf-8'>\n"
        "<meta name='viewport' content='width=device-width, initial-scale=1'>\n"
        "<meta name='robots' content='noindex, nofollow'>\n"
        "<title>岗位投稿预览 · Yat’s List</title>\n<style>\n"
        ":root{--bg:#0d1218;--panel:#131a22;--border:#22303d;--ink:#e8f0ec;--sec:#93a5ad;--green:#2ee6a8;--red:#ff7a7a}\n"
        "*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;line-height:1.6}\n"
        ".wrap{max-width:680px;margin:0 auto;padding:34px 18px 60px}\n"
        ".banner{border:1px solid var(--green);border-radius:14px;padding:16px 18px;margin-bottom:16px;background:var(--panel)}\n"
        ".banner.bad{border-color:var(--red)}.banner.wait{border-color:#ffb454}\n"
        ".banner b{font-size:1.15rem}.why{color:var(--sec);margin:6px 0 0;font-size:.92rem}\n"
        ".card{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:18px}\n"
        ".card h1{font-size:1.3rem;margin:0 0 10px;line-height:1.4}\n"
        ".meta{color:var(--sec);font-size:.92rem;margin:4px 0}.meta .k{display:inline-block;min-width:3.2em;color:var(--ink)}\n"
        ".meta a{color:var(--green);word-break:break-all}\n"
        ".sum{margin:12px 0 0;white-space:pre-wrap}\n"
        ".btn{display:inline-block;border-radius:999px;padding:9px 20px;font-weight:700;border:1.5px solid var(--green);background:var(--green);color:#06130d;text-decoration:none;font-size:.92rem}\n"
        "footer{color:var(--sec);font-size:.85rem;margin-top:26px;text-align:center}\n</style>\n</head>\n<body>\n<div class='wrap'>\n"
        "<div class='banner" + bcls + "'><b>" + esc(label) + "</b>" + extra + "</div>\n"
        "<div class='card'><h1>" + esc(str(jb.get("title") or "(无标题)")) + "</h1>" + rows + summary + link_btn + "</div>\n"
        "<p style='color:#ffb454;font-size:.9rem;margin-top:18px;line-height:1.65'>⚠️ 岗位投稿人备忘：修改或撤回这条岗位投稿，需要投稿时发放的 <b>edit_key</b>（只显示过一次，遗失无法找回）。请确认你已把它和编号一起存好。</p>\n"
        "<footer>Yat’s List 岗位投稿预览 · 编号 " + esc(str(rec.get("id") or "")) + "</footer>\n"
        "</div>\n</body>\n</html>\n")

_NOTFOUND_JOB_HTML = "<!DOCTYPE html>\n<html lang='zh-CN'><head><meta charset='utf-8'><title>404</title></head><body style='background:#0d1218;color:#e8f0ec;font-family:sans-serif;text-align:center;padding:20vh 20px'><h1>404</h1><p>找不到这条岗位投稿。</p></body></html>\n"

_NOTFOUND_HTML = "<!DOCTYPE html>\n<html lang='zh-CN'><head><meta charset='utf-8'><title>404</title></head><body style='background:#0d1218;color:#e8f0ec;font-family:sans-serif;text-align:center;padding:20vh 20px'><h1>404</h1><p>找不到这条投稿。</p></body></html>\n"

ADMIN_HTML = r'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>审核台 · Yat's List</title>
<style>
:root{--bg:#0d1218;--panel:#131a22;--panel2:#18212b;--border:#22303d;--ink:#e8f0ec;--sec:#93a5ad;--dim:#6b7d86;--green:#2ee6a8;--red:#ff7a7a;--amber:#ffb454;--blue:#7cc4ff}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
a{color:var(--green);text-decoration:none}
a:hover{text-decoration:underline}
button,input{font:inherit;color:inherit}
.top{position:sticky;top:0;z-index:5;background:rgba(13,18,24,.92);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-bottom:1px solid var(--border)}
.top-in{max-width:1080px;margin:0 auto;padding:12px 20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.brand{font-weight:700;font-size:1.05rem;margin-right:auto;white-space:nowrap}
.brand span{color:var(--sec);font-weight:400;margin-left:6px}
.nav{display:flex;gap:4px;background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:4px}
.nav button{background:none;border:0;border-radius:9px;padding:7px 14px;cursor:pointer;color:var(--sec);display:flex;align-items:center;gap:7px;white-space:nowrap}
.nav button.on{background:var(--panel2);color:var(--ink)}
.badge{min-width:20px;height:20px;border-radius:10px;padding:0 6px;font-size:.75rem;font-weight:700;display:inline-flex;align-items:center;justify-content:center;background:var(--border);color:var(--sec)}
.badge.hot{background:var(--amber);color:#1a1205}
.tool{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:7px 12px;cursor:pointer;color:var(--sec);white-space:nowrap}
.tool:hover{color:var(--ink)}
.wrap{max-width:1080px;margin:0 auto;padding:22px 20px 80px}
.hint{color:var(--sec);font-size:.88rem;margin:0 0 16px}
.bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.cf{background:transparent;border:1px solid var(--border);border-radius:999px;padding:5px 12px;cursor:pointer;color:var(--sec);font-size:.88rem}
.cf.on{border-color:var(--green);color:var(--green);background:rgba(46,230,168,.08)}
.cf i{font-style:normal;opacity:.7;margin-left:5px}
.search{margin-left:auto;background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:8px 12px;width:230px}
.search:focus,.gate input:focus{outline:none;border-color:var(--green)}
.card{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:16px 18px;margin-bottom:10px;display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:14px;align-items:start;transition:opacity .2s}
.card.noav{grid-template-columns:minmax(0,1fr) auto}
.card.todo{border-left:3px solid var(--amber)}
.card.busy{opacity:.45;pointer-events:none}
.av{width:44px;height:44px;border-radius:50%;background:var(--border);object-fit:cover}
.title{font-weight:700;font-size:1.02rem;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.title a{font-weight:400;font-size:.85rem;color:var(--sec)}
.meta{color:var(--sec);font-size:.86rem;margin-top:3px}
.meta span+span:before{content:"·";margin:0 7px;color:var(--dim)}
.text{margin:8px 0 0;white-space:pre-wrap;word-break:break-word}
.text.none{color:var(--dim)}
.url{display:block;margin-top:6px;font-size:.86rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tags{margin-top:8px;display:flex;gap:6px;flex-wrap:wrap}
.tag{border:1px solid var(--border);border-radius:999px;padding:1px 9px;font-size:.78rem;color:var(--sec)}
.reason{margin-top:10px;font-size:.86rem;padding:8px 11px;border-radius:8px;background:var(--panel2);color:var(--sec)}
.reason b{color:var(--ink);font-weight:600}
.foot{margin-top:10px;font-size:.78rem;color:var(--dim);display:flex;gap:14px;flex-wrap:wrap}
.foot code{font-family:ui-monospace,Menlo,monospace;cursor:pointer}
.foot code:hover{color:var(--sec)}
.pill{font-size:.74rem;font-weight:600;border-radius:999px;padding:1px 9px;border:1px solid currentColor;white-space:nowrap}
.c-green{color:var(--green)}.c-red{color:var(--red)}.c-amber{color:var(--amber)}.c-sec{color:var(--sec)}.c-blue{color:var(--blue)}
.acts{display:flex;flex-direction:column;gap:8px;min-width:92px}
.btn{border-radius:10px;padding:8px 16px;font-weight:700;cursor:pointer;border:1.5px solid var(--green);background:var(--green);color:#06130d;font-size:.9rem}
.btn.no{background:transparent;color:var(--red);border-color:var(--red)}
.btn:hover{filter:brightness(1.1)}
.empty{color:var(--sec);padding:46px 16px;text-align:center;border:1px dashed var(--border);border-radius:14px}
.empty button{margin-top:12px}
.gate{max-width:400px;margin:14vh auto 0;background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:28px}
.gate h1{font-size:1.3rem;margin:0 0 6px}
.gate p{color:var(--sec);font-size:.88rem;margin:0}
.gate input{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:12px;font-size:1rem;margin:16px 0 12px}
.gate .btn{width:100%;padding:11px}
.err{color:var(--red);font-size:.88rem;min-height:1.3em;margin-top:10px}
#toast{position:fixed;left:50%;bottom:24px;transform:translate(-50%,16px);background:var(--panel2);border:1px solid var(--border);border-radius:10px;padding:10px 16px;opacity:0;transition:.2s;pointer-events:none;font-size:.9rem;z-index:9;max-width:90vw}
#toast.show{opacity:1;transform:translate(-50%,0)}
#toast.bad{border-color:var(--red);color:var(--red)}
@media (max-width:680px){
  .top-in{padding:10px 14px}
  .wrap{padding:16px 14px 70px}
  .nav{order:3;width:100%}
  .nav button{flex:1;justify-content:center;padding:7px 4px}
  .search{width:100%;margin-left:0}
  .card{grid-template-columns:44px minmax(0,1fr);padding:14px}
  .card.noav{grid-template-columns:minmax(0,1fr)}
  .acts{grid-column:1/-1;flex-direction:row}
  .acts .btn{flex:1}
}
</style>
</head>
<body>
<div id="gate" class="gate" style="display:none">
  <h1>审核台口令</h1>
  <p>只有维护者能用。口令在 VMISS 服务器上，输入一次后记在本机浏览器。</p>
  <input type="password" id="tok" placeholder="输入口令" autocomplete="current-password" onkeydown="if(event.key==='Enter')saveTok()">
  <button class="btn" onclick="saveTok()">进入审核台</button>
  <div class="err" id="gate-msg"></div>
</div>
<div id="app" style="display:none">
  <header class="top"><div class="top-in">
    <div class="brand">Yat's List<span>审核台</span></div>
    <nav class="nav" id="nav"></nav>
    <button class="tool" onclick="load(true)" title="重新拉取">刷新</button>
    <button class="tool" onclick="logout()" title="清除本机保存的口令">退出</button>
  </div></header>
  <main class="wrap">
    <p class="hint" id="hint"></p>
    <div class="bar">
      <div class="chips" id="chips"></div>
      <input class="search" id="q" type="search" placeholder="搜索标题 / 账号 / 编号…" oninput="S.q=this.value.trim().toLowerCase();render()">
    </div>
    <div id="list"></div>
  </main>
</div>
<div id="toast"></div>
<script>
(function(){try{var t=new URLSearchParams(location.search).get("t");if(t){localStorage.setItem("xadmin_tok",t.trim());history.replaceState(null,"",location.pathname+location.hash);}}catch(e){}})();

const SECTIONS={
  ev:{name:"活动投稿",hint:"通过 API 投稿的活动。每日 07:30 由 AI 逐条核实、去重；AI 拿不准的标为「待你审核」，在这里决定。「待 AI 初审」的也可以直接通过 / 拒绝，不用等 AI。",
     filters:[["todo","待你审核"],["queue","待 AI 初审"],["done","已收录"],["no","已拒绝"],["withdrawn","已撤回"],["all","全部"]]},
  x:{name:"X 名录",hint:"自助登记的 X 账号。点「通过」后约 20 分钟内自动上榜，「拒绝」的不会上榜。不处理也行，每日任务会轻核其余申请。",
     filters:[["todo","待审"],["approved","已通过"],["rejected","已拒绝"],["all","全部"]]},
  job:{name:"岗位投稿",hint:"通过 API 投稿的岗位（招聘页暂未公开）。每日更新时 AI 初审；拿不准的标为「待你审核」，在这里决定。「待 AI 初审」的也可以直接通过 / 拒绝，不用等 AI。",
     filters:[["todo","待你审核"],["queue","待 AI 初审"],["done","已上线"],["no","已拒绝"],["withdrawn","已撤回"],["all","全部"]]}
};
const S={sec:(location.hash.slice(1) in SECTIONS)?location.hash.slice(1):"ev",filter:{x:"todo",ev:"todo",job:"todo"},q:"",data:{x:[],ev:[],job:[]},rev:{ev:{},job:{}}};

function $(id){return document.getElementById(id)}
function tok(){return localStorage.getItem("xadmin_tok")||""}
function esc(x){return String(x==null?"":x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function safeUrl(u){u=String(u||"").trim();return /^https?:\/\//i.test(u)?u:""}
function ghUrl(g){g=String(g||"").trim();if(/^https?:\/\//.test(g))return g;return "https://github.com/"+g.replace(/^@+/,"").replace(/^github\.com\//,"")}
function toast(msg,bad){const t=$("toast");t.textContent=msg;t.className="show"+(bad?" bad":"");clearTimeout(toast._t);toast._t=setTimeout(()=>t.className="",2600)}

function when(s){
  if(!s)return "";
  const d=new Date(s);if(isNaN(d))return esc(s);
  const p=n=>String(n).padStart(2,"0");
  const abs=p(d.getMonth()+1)+"-"+p(d.getDate())+" "+p(d.getHours())+":"+p(d.getMinutes());
  const m=Math.round((Date.now()-d)/60000);
  let rel="";
  if(m>=0){rel=m<1?"刚刚":m<60?m+" 分钟前":m<1440?Math.floor(m/60)+" 小时前":m<43200?Math.floor(m/1440)+" 天前":""}
  return '<span title="'+esc(s)+'">'+abs+(rel?"（"+rel+"）":"")+"</span>";
}

function showGate(msg){$("app").style.display="none";$("gate").style.display="block";$("gate-msg").textContent=msg||"";setTimeout(()=>$("tok").focus(),0)}
function saveTok(){const v=$("tok").value.trim();if(!v){$("gate-msg").textContent="先输入口令。";return}localStorage.setItem("xadmin_tok",v);load()}
function logout(){localStorage.removeItem("xadmin_tok");location.replace(location.pathname)}

async function api(path,opt){
  const r=await fetch(path,Object.assign({headers:{"Content-Type":"application/json","X-Admin-Token":tok()}},opt||{}));
  if(r.status===401){showGate("口令不对，再试一次。");throw new Error("401")}
  if(!r.ok)throw new Error("HTTP "+r.status);
  return r.json();
}

async function load(manual){
  if(!tok()){showGate();return}
  let x;
  try{x=await api("/v1/admin/xlist")}catch(e){if(e.message!=="401")toast("加载失败："+e.message,true);return}
  const byNew=a=>(a||[]).slice().sort((p,q)=>String(q.received_at||"").localeCompare(String(p.received_at||"")));
  S.data.x=byNew(x.items);
  const [ev,job]=await Promise.allSettled([api("/v1/admin/events"),api("/v1/admin/jobs")]);
  if(ev.status==="fulfilled"){S.data.ev=byNew(ev.value.items);S.rev.ev=ev.value.reviews||{}}else toast("活动队列加载失败",true);
  if(job.status==="fulfilled"){S.data.job=byNew(job.value.items);S.rev.job=job.value.reviews||{}}else toast("岗位队列加载失败",true);
  $("gate").style.display="none";$("app").style.display="block";
  render();
  if(manual)toast("已刷新");
}

/* 状态归类：key 用于筛选，label/c 用于显示 */
function xState(it){
  if(it.status==="approved")return {key:"approved",label:"已通过 · 待上榜",c:"green"};
  if(it.status==="rejected")return {key:"rejected",label:"已拒绝",c:"red"};
  return {key:"todo",label:"待审",c:"amber",act:true,can:true};
}
function qState(r,listedWord){
  if(r.human==="approved")return {key:"done",label:"你已通过 · 等每日更新"+listedWord,c:"green"};
  if(r.human==="rejected")return {key:"no",label:"你已拒绝",c:"red"};
  if(r.verdict==="withdrawn")return {key:"withdrawn",label:"投稿人已撤回",c:"sec"};
  if(r.verdict==="pending_human")return {key:"todo",label:"待你审核",c:"amber",act:true,can:true};
  if(r.needs_recheck)return {key:"queue",label:"已修改 · 待重新初审",c:"blue",can:true};
  if(r.verdict==="listed")return {key:"done",label:"AI 已"+listedWord,c:"green"};
  if(r.verdict==="rejected")return {key:"no",label:"AI 已拒绝",c:"red"};
  return {key:"queue",label:"待 AI 初审",c:"blue",can:true};
}
function stateOf(sec,it){
  if(sec==="x")return xState(it);
  return qState(S.rev[sec][it.id]||{},sec==="ev"?"收录":"上线");
}

function renderNav(){
  $("nav").innerHTML=Object.keys(SECTIONS).map(k=>{
    const n=S.data[k].filter(it=>stateOf(k,it).act).length;
    return '<button class="'+(k===S.sec?"on":"")+'" onclick="setSec(\''+k+'\')">'+SECTIONS[k].name+'<span class="badge'+(n?" hot":"")+'">'+n+"</span></button>";
  }).join("");
}
function setSec(k){S.sec=k;history.replaceState(null,"","#"+k);render();window.scrollTo(0,0)}
function setFilter(f){S.filter[S.sec]=f;render()}

function render(){
  renderNav();
  const sec=S.sec,cfg=SECTIONS[sec],f=S.filter[sec];
  $("hint").textContent=cfg.hint;
  const all=S.data[sec].map(it=>({it,st:stateOf(sec,it)}));
  const counts={all:all.length};
  all.forEach(o=>counts[o.st.key]=(counts[o.st.key]||0)+1);
  $("chips").innerHTML=cfg.filters.map(([k,l])=>'<button class="cf'+(k===f?" on":"")+'" onclick="setFilter(\''+k+'\')">'+l+"<i>"+(counts[k]||0)+"</i></button>").join("");
  let rows=all.filter(o=>f==="all"||o.st.key===f);
  if(S.q)rows=rows.filter(o=>JSON.stringify(o.it).toLowerCase().includes(S.q));
  const el=$("list");
  if(!rows.length){
    const msg=S.q?"没有匹配「"+esc(S.q)+"」的记录。":f==="todo"?"没有需要你处理的，都清空了。":"这里没有记录。";
    el.innerHTML='<div class="empty">'+msg+(f!=="all"&&counts.all?'<br><button class="tool" onclick="setFilter(\'all\')">看全部 '+counts.all+" 条</button>":"")+"</div>";
    return;
  }
  el.innerHTML=rows.map(o=>sec==="x"?xCard(o.it,o.st):qCard(sec,o.it,o.st)).join("");
}

function pill(st){return '<span class="pill c-'+st.c+'">'+esc(st.label)+"</span>"}
function metaLine(arr){arr=arr.filter(Boolean);return arr.length?'<div class="meta">'+arr.map(v=>"<span>"+v+"</span>").join("")+"</div>":""}
function foot(it,extra){
  return '<div class="foot"><span>收到 '+when(it.received_at)+"</span>"+(it.channel?"<span>渠道 "+esc(it.channel)+"</span>":"")+(extra||"")+'<code title="点击复制" onclick="copyId(this)">'+esc(it.id||"")+"</code></div>";
}
function acts(sec,it){
  const id=esc(it.id);
  return '<div class="acts"><button class="btn" onclick="act(\''+sec+'\',\''+id+'\',true,this)">通过</button><button class="btn no" onclick="act(\''+sec+'\',\''+id+'\',false,this)">拒绝</button></div>';
}

function xCard(it,st){
  const p=it.person||{},h=esc(p.handle);
  const tags=(p.categories||[]).map(c=>'<span class="tag">'+esc(c)+"</span>").join("");
  return '<div class="card'+(st.act?" todo":"")+'" data-id="'+esc(it.id)+'">'
    +'<img class="av" src="https://unavatar.io/x/'+encodeURIComponent(p.handle||"")+'" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">'
    +'<div><div class="title">@'+h+" "+pill(st)+' <a href="https://x.com/'+encodeURIComponent(p.handle||"")+'" target="_blank" rel="noopener">X 主页 ↗</a></div>'
    +metaLine([p.relation?esc(p.relation):"",p.github?'GitHub <a href="'+esc(ghUrl(p.github))+'" target="_blank" rel="noopener">'+esc(p.github)+"</a>":""])
    +(p.intro?'<p class="text">'+esc(p.intro)+"</p>":'<p class="text none">（没填自我介绍）</p>')
    +(tags?'<div class="tags">'+tags+"</div>":"")
    +foot(it,it.reviewed_at?"<span>处理于 "+when(it.reviewed_at)+"</span>":"")
    +"</div>"+(st.can?acts("x",it):"")+"</div>";
}

function qCard(sec,it,st){
  const isEv=sec==="ev";
  const e=(it.payload&&(isEv?it.payload.event:it.payload.job))||{};
  const r=S.rev[sec][it.id]||{};
  const u=safeUrl(e.url),lu=safeUrl(r.listed_url);
  const meta=isEv?[e.start?when(e.start).replace(/（.*?）/,""):"",esc(e.venue),esc(e.district),e.city&&e.city!=="深圳"?esc(e.city):"",esc(e.format),esc(e.fee),esc(e.organizer)]
                 :[esc(e.company),esc(e.district),esc(e.type),esc(e.salary)];
  const tagsSrc=isEv?e.categories:e.tags;
  const tags=(Array.isArray(tagsSrc)?tagsSrc:(tagsSrc?[tagsSrc]:[])).map(c=>'<span class="tag">'+esc(c)+"</span>").join("");
  let reason="";
  if(r.reason)reason='<div class="reason"><b>AI 初审意见：</b>'+esc(r.reason)+"</div>";
  if(r.needs_recheck)reason+='<div class="reason">投稿人在初审后改过内容。</div>';
  return '<div class="card noav'+(st.act?" todo":"")+'" data-id="'+esc(it.id)+'"><div>'
    +'<div class="title">'+esc(e.title||"（无标题）")+" "+pill(st)+(lu?' <a href="'+esc(lu)+'" target="_blank" rel="noopener">线上条目 ↗</a>':"")+"</div>"
    +metaLine(meta)
    +(e.summary?'<p class="text">'+esc(e.summary)+"</p>":"")
    +(u?'<a class="url" href="'+esc(u)+'" target="_blank" rel="noopener">'+esc(u)+"</a>":"")
    +(tags?'<div class="tags">'+tags+"</div>":"")
    +reason
    +foot(it,r.human_at?"<span>你处理于 "+when(r.human_at)+"</span>":r.at?"<span>初审于 "+when(r.at)+"</span>":"")
    +"</div>"+(st.can?acts(sec,it):"")+"</div>";
}

function copyId(el){
  const t=el.textContent;
  (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>toast("已复制 "+t),()=>toast(t));
}

async function act(sec,id,ok,btn){
  const card=btn.closest(".card");card.classList.add("busy");
  try{
    if(sec==="x"){
      await api("/v1/admin/xlist/"+(ok?"approve":"reject"),{method:"POST",body:JSON.stringify({id})});
      const it=S.data.x.find(x=>x.id===id);
      if(it){it.status=ok?"approved":"rejected";it.reviewed_at=new Date().toISOString()}
    }else{
      const d=await api("/v1/admin/"+(sec==="ev"?"events":"jobs")+"/decide",{method:"POST",body:JSON.stringify({id,decision:ok?"approved":"rejected"})});
      S.rev[sec][id]=d.review||Object.assign({},S.rev[sec][id],{human:ok?"approved":"rejected",human_at:new Date().toISOString()});
    }
    toast(ok?"已通过":"已拒绝");
    render();
  }catch(e){
    card.classList.remove("busy");
    if(e.message!=="401")toast("操作失败："+e.message+"，请重试",true);
  }
}

window.addEventListener("keydown",e=>{if(e.key==="/"&&document.activeElement.tagName!=="INPUT"){e.preventDefault();$("q").focus()}});
load();
</script>
</body>
</html>
'''


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

    def _get_event_status(self, sub_id):
        if not _SUB_ID_RE.match(sub_id or ""):
            self._send(404, {"error": "not_found"})
            return
        rec = _find_submission(sub_id)
        if not rec:
            self._send(404, {"error": "not_found"})
            return
        review = _read_reviews().get(sub_id)
        ev = ((rec.get("payload") or {}).get("event")) or {}
        self._send(200, {
            "id": rec.get("id"),
            "received_at": rec.get("received_at"),
            "channel": rec.get("channel"),
            "status": _derive_status(review),
            "amended_at": rec.get("amended_at"),
            "edit_key_hint": "修改或撤回这条投稿需要投稿时发放的 edit_key（只显示过一次，遗失无法找回）；查询状态不需要它。",
            "event": ev,
            "review": review,
        })

    def _get_preview(self, sub_id):
        if not _SUB_ID_RE.match(sub_id or ""):
            self._send_html(404, _NOTFOUND_HTML)
            return
        rec = _find_submission(sub_id)
        if not rec:
            self._send_html(404, _NOTFOUND_HTML)
            return
        review = _read_reviews().get(sub_id)
        self._send_html(200, _preview_html(rec, review))

    def _get_job_status(self, job_id):
        if not _JOB_ID_RE.match(job_id or ""):
            self._send(404, {"error": "not_found"})
            return
        rec = _find_job(job_id)
        if not rec:
            self._send(404, {"error": "not_found"})
            return
        review = _read_jreviews().get(job_id)
        jb = ((rec.get("payload") or {}).get("job")) or {}
        self._send(200, {
            "id": rec.get("id"),
            "received_at": rec.get("received_at"),
            "channel": rec.get("channel"),
            "status": _derive_status(review),
            "amended_at": rec.get("amended_at"),
            "edit_key_hint": "修改或撤回这条岗位投稿需要投稿时发放的 edit_key（只显示过一次，遗失无法找回）；查询状态不需要它。",
            "job": jb,
            "review": review,
        })

    def _get_job_preview(self, job_id):
        if not _JOB_ID_RE.match(job_id or ""):
            self._send_html(404, _NOTFOUND_JOB_HTML)
            return
        rec = _find_job(job_id)
        if not rec:
            self._send_html(404, _NOTFOUND_JOB_HTML)
            return
        review = _read_jreviews().get(job_id)
        self._send_html(200, _preview_job_html(rec, review))

    def _post_job(self):
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
        jb = payload.get("job")
        if not isinstance(jb, dict):
            self._send(400, {"error": "missing_job"})
            return
        missing = [k for k in ("title", "company", "url") if not jb.get(k)]
        if missing:
            self._send(400, {"error": "missing_fields", "fields": missing})
            return
        url = str(jb.get("url", ""))
        if not (url.startswith("http://") or url.startswith("https://")):
            self._send(400, {"error": "invalid_url"})
            return
        if not rate_ok(ip):
            self._send(429, {"error": "rate_limited"})
            return
        jid = "job-" + secrets.token_hex(6)
        edit_key = secrets.token_hex(16)
        record = {
            "id": jid,
            "received_at": datetime.now(CST).strftime("%Y-%m-%dT%H:%M:%S+08:00"),
            "ip": ip,
            "channel": payload.get("channel") or "agent",
            "status": "pending",
            "edit_key_hash": _hash_edit_key(edit_key),
            "payload": payload,
        }
        try:
            append_jqueue(record)
        except Exception as e:
            self._send(500, {"error": "storage", "detail": str(e)[:100]})
            return
        self._send(202, {"id": jid, "status": "queued_for_review",
                         "status_url": "https://submit.yatslist.com/v1/jobs/" + jid,
                         "preview_url": "https://submit.yatslist.com/preview-job/" + jid,
                         "edit_key": edit_key,
                         "edit_key_usage": "修改：POST /v1/jobs/<id>/amend，请求体 {\"edit_key\":\"…\",\"job\":{…新版岗位对象…}}；撤回：POST /v1/jobs/<id>/withdraw，请求体 {\"edit_key\":\"…\"}。",
                         "IMPORTANT": "⚠️ edit_key 是这条岗位投稿的唯一修改凭证，只显示这一次。服务器只保存它的哈希，遗失后任何人（包括维护者）都无法找回——没有它，你不能修改、也不能撤回这条岗位投稿。请立刻把 edit_key 和 id 一起存进你的长期存储（记忆文件 / 密钥库 / 笔记），不要只留在本次对话里：对话上下文会被压缩或丢失，密钥丢了，这条岗位投稿就再也动不了。"})

    def _job_owner_action(self, job_id, action):
        if not _JOB_ID_RE.match(job_id or ""):
            self._send(404, {"error": "not_found"})
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
        rec = _find_job(job_id)
        if not rec:
            self._send(404, {"error": "not_found"})
            return
        stored = rec.get("edit_key_hash")
        if not stored:
            self._send(403, {"error": "no_edit_key", "hint": "这条岗位投稿没有投稿密钥，无法自助修改或撤回；请联系维护者，或重新投稿。"})
            return
        provided = str(payload.get("edit_key") or "")
        if not provided or not secrets.compare_digest(_hash_edit_key(provided), stored):
            self._send(403, {"error": "invalid_edit_key"})
            return
        ip = self.headers.get("X-Real-IP") or self.client_address[0]
        if not rate_ok(ip):
            self._send(429, {"error": "rate_limited"})
            return
        now = datetime.now(CST).strftime("%Y-%m-%dT%H:%M:%S+08:00")
        if action == "withdraw":
            _update_jreview(job_id, {"verdict": "withdrawn", "reason": str(payload.get("reason") or "投稿人撤回")[:300], "by": "submitter", "at": now, "needs_recheck": None, "human": None, "human_at": None})
            _update_job_record(job_id, {"status": "withdrawn"})
            self._send(200, {"ok": True, "id": job_id, "status": "withdrawn", "note": "已撤回；若这个岗位已上线，将在下一次每日更新时下线。"})
            return
        if payload.get("website"):
            self._send(400, {"error": "rejected"})
            return
        jb = payload.get("job")
        if not isinstance(jb, dict):
            self._send(400, {"error": "missing_job"})
            return
        missing = [k for k in ("title", "company", "url") if not jb.get(k)]
        if missing:
            self._send(400, {"error": "missing_fields", "fields": missing})
            return
        url = str(jb.get("url", ""))
        if not (url.startswith("http://") or url.startswith("https://")):
            self._send(400, {"error": "invalid_url"})
            return
        new_payload = dict(rec.get("payload") or {})
        new_payload["job"] = jb
        _update_job_record(job_id, {"payload": new_payload, "amended_at": now, "status": "pending"})
        _update_jreview(job_id, {"needs_recheck": True, "amended_at": now, "verdict": None, "reason": None, "by": None, "at": None, "human": None, "human_at": None})
        self._send(200, {"ok": True, "id": job_id, "status": "queued_for_review", "note": "已更新，将重新走一遍初审；若原已上线，改动会在审核通过后同步到清单页。"})

    def _admin_job_review(self, who):
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
        job_id = str(payload.get("id") or "")
        if not job_id:
            self._send(400, {"error": "id_required"})
            return
        now = datetime.now(CST).strftime("%Y-%m-%dT%H:%M:%S+08:00")
        if who == "agent":
            verdict = str(payload.get("verdict") or "")
            if verdict not in ("listed", "rejected", "pending_human"):
                self._send(400, {"error": "bad_verdict"})
                return
            fields = {"verdict": verdict, "reason": str(payload.get("reason") or "")[:300], "by": "agent", "at": now}
            if payload.get("listed_url"):
                fields["listed_url"] = str(payload.get("listed_url"))[:300]
            fields["needs_recheck"] = None
            rec = _update_jreview(job_id, fields)
        else:
            decision = str(payload.get("decision") or "")
            if decision not in ("approved", "rejected"):
                self._send(400, {"error": "bad_decision"})
                return
            rec = _update_jreview(job_id, {"human": decision, "human_at": now})
        self._send(200, {"ok": True, "id": job_id, "review": rec})

    def do_GET(self):
        _p = self._path_only()
        if _p.startswith("/v1/events/"):
            self._get_event_status(_p[len("/v1/events/"):])
            return
        if _p.startswith("/preview/"):
            self._get_preview(_p[len("/preview/"):])
            return
        if _p.startswith("/v1/jobs/"):
            self._get_job_status(_p[len("/v1/jobs/"):])
            return
        if _p.startswith("/preview-job/"):
            self._get_job_preview(_p[len("/preview-job/"):])
            return
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
        elif self._path_only() == "/v1/admin/jobs":
            if not self._admin_ok():
                self._send(401, {"error": "unauthorized"})
            else:
                items = []
                try:
                    with open(JQUEUE, encoding="utf-8") as f:
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
                self._send(200, {"items": items, "count": len(items), "reviews": _read_jreviews()})
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
                "job_submit": "POST /v1/jobs",
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
            fields = {"verdict": verdict, "reason": str(payload.get("reason") or "")[:300], "by": "agent", "at": now}
            if payload.get("listed_url"):
                fields["listed_url"] = str(payload.get("listed_url"))[:300]
            fields["needs_recheck"] = None
            rec = _update_review(sub_id, fields)
        else:
            decision = str(payload.get("decision") or "")
            if decision not in ("approved", "rejected"):
                self._send(400, {"error": "bad_decision"})
                return
            rec = _update_review(sub_id, {"human": decision, "human_at": now})
        self._send(200, {"ok": True, "id": sub_id, "review": rec})

    def _event_owner_action(self, sub_id, action):
        if not _SUB_ID_RE.match(sub_id or ""):
            self._send(404, {"error": "not_found"})
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
        rec = _find_submission(sub_id)
        if not rec:
            self._send(404, {"error": "not_found"})
            return
        stored = rec.get("edit_key_hash")
        if not stored:
            self._send(403, {"error": "no_edit_key", "hint": "这条投稿提交于投稿密钥功能上线前，没有密钥；请联系维护者，或重新投稿。"})
            return
        provided = str(payload.get("edit_key") or "")
        if not provided or not secrets.compare_digest(_hash_edit_key(provided), stored):
            self._send(403, {"error": "invalid_edit_key"})
            return
        ip = self.headers.get("X-Real-IP") or self.client_address[0]
        if not rate_ok(ip):
            self._send(429, {"error": "rate_limited"})
            return
        now = datetime.now(CST).strftime("%Y-%m-%dT%H:%M:%S+08:00")
        if action == "withdraw":
            _update_review(sub_id, {"verdict": "withdrawn", "reason": str(payload.get("reason") or "投稿人撤回")[:300], "by": "submitter", "at": now, "needs_recheck": None, "human": None, "human_at": None})
            _update_submission(sub_id, {"status": "withdrawn"})
            self._send(200, {"ok": True, "id": sub_id, "status": "withdrawn", "note": "已撤回；若这条活动已收录，将在下一次每日更新时下线。"})
            return
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
        new_payload = dict(rec.get("payload") or {})
        new_payload["event"] = ev
        _update_submission(sub_id, {"payload": new_payload, "amended_at": now, "status": "pending"})
        _update_review(sub_id, {"needs_recheck": True, "amended_at": now, "verdict": None, "reason": None, "by": None, "at": None, "human": None, "human_at": None})
        self._send(200, {"ok": True, "id": sub_id, "status": "queued_for_review", "note": "已更新，将重新走一遍初审；若原已收录，改动会在审核通过后同步到线上条目。"})

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
        if self._path_only() == "/v1/admin/jobs/verdict":
            self._admin_job_review("agent")
            return
        if self._path_only() == "/v1/admin/jobs/decide":
            self._admin_job_review("human")
            return
        _p = self._path_only()
        if _p.startswith("/v1/events/") and (_p.endswith("/amend") or _p.endswith("/withdraw")):
            _sub = _p[len("/v1/events/"):].rsplit("/", 1)[0]
            self._event_owner_action(_sub, "amend" if _p.endswith("/amend") else "withdraw")
            return
        if self._path_only() == "/v1/xlist":
            self._post_xlist()
            return
        if _p.startswith("/v1/jobs/") and (_p.endswith("/amend") or _p.endswith("/withdraw")):
            _job = _p[len("/v1/jobs/"):].rsplit("/", 1)[0]
            self._job_owner_action(_job, "amend" if _p.endswith("/amend") else "withdraw")
            return
        if self._path_only() == "/v1/jobs":
            self._post_job()
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
        edit_key = secrets.token_hex(16)
        record = {
            "id": sid,
            "received_at": datetime.now(CST).strftime("%Y-%m-%dT%H:%M:%S+08:00"),
            "ip": ip,
            "channel": payload.get("channel") or "agent",
            "status": "pending",
            "edit_key_hash": _hash_edit_key(edit_key),
            "payload": payload,
        }
        try:
            append_queue(record)
        except Exception as e:
            self._send(500, {"error": "storage", "detail": str(e)[:100]})
            return
        self._send(202, {"id": sid, "status": "queued_for_review",
                         "status_url": "https://submit.yatslist.com/v1/events/" + sid,
                         "preview_url": "https://submit.yatslist.com/preview/" + sid,
                         "edit_key": edit_key,
                         "edit_key_usage": "修改：POST /v1/events/<id>/amend，请求体 {\"edit_key\":\"…\",\"event\":{…新版活动对象…}}；撤回：POST /v1/events/<id>/withdraw，请求体 {\"edit_key\":\"…\"}。",
                         "IMPORTANT": "⚠️ edit_key 是这条投稿的唯一修改凭证，只显示这一次。服务器只保存它的哈希，遗失后任何人（包括维护者）都无法找回——没有它，你不能修改、也不能撤回这条投稿。请立刻把 edit_key 和 id 一起存进你的长期存储（记忆文件 / 密钥库 / 笔记），不要只留在本次对话里：对话上下文会被压缩或丢失，密钥丢了，这条投稿就再也动不了。"})


if __name__ == "__main__":
    os.makedirs(DATA_DIR, exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", 8791), Handler)
    print("intake listening on 127.0.0.1:8791", flush=True)
    server.serve_forever()
