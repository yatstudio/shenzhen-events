#!/usr/bin/env python3
"""Yat's List 分享资产生成器：为 events.json 每条活动生成
  1) 分享卡 PNG（输出到 IMG_DIR，部署到 img.yatslist.com/share/<id>.png）
  2) 短链落地页 e/<id>/index.html（随仓库推送到 GitHub Pages）
增量：私有 manifest 记录每条内容哈希，未变的跳过。
id 规则：6 位 base36(md5(url+start))，注册表在私有目录 event-ids.json，生成即冻结。
"""
import json, hashlib, os, sys, datetime

REPO = os.path.expanduser('~/workspace/shenzhen-events')
PRIV = os.path.expanduser('~/workspace/shenzhen-events-private')
IMG_DIR = os.path.expanduser('~/workspace/shenzhen-events-share-img/share')
EVENTS = os.path.join(REPO, 'events.json')
REGISTRY = os.path.join(PRIV, 'event-ids.json')
MANIFEST = os.path.join(PRIV, 'share-manifest.json')
IMG_BASE = 'https://img.yatslist.com/share'
SITE = 'https://yatslist.com'

FB = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
FR = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
FMB = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
FMR = "/usr/share/fonts/truetype/noto/NotoSansMono-Regular.ttf"

def code_for(url, start):
    seed = url + (start or '')
    n = int.from_bytes(hashlib.md5(seed.encode()).digest()[:5], 'big')
    digs = '0123456789abcdefghijklmnopqrstuvwxyz'; s = ''
    while n: s = digs[n % 36] + s; n //= 36
    return s.rjust(6, '0') if len(s) < 6 else s[:6]

def ensure_ids(data):
    reg = {}
    if os.path.exists(REGISTRY):
        reg = json.load(open(REGISTRY)).get('ids', {})
    changed = False
    used = set(reg.values())
    for e in data['events']:
        key = (e.get('url') or '') + '|' + (e.get('start') or '')
        if e.get('id'):
            if reg.get(key) != e['id']:
                reg[key] = e['id']; changed = True
            used.add(e['id']); continue
        c = reg.get(key) or code_for(e.get('url') or '', e.get('start'))
        tries = 0
        while c in used and reg.get(key) != c:
            tries += 1
            c = code_for((e.get('url') or '') + '#' + str(tries), e.get('start'))
        nid = {'id': c}; nid.update(e); e.clear(); e.update(nid)
        reg[key] = c; used.add(c); changed = True
    if changed:
        json.dump({'note': 'Frozen id registry: key = url|start -> id. Never reassign a code to a different event.', 'ids': reg},
                  open(REGISTRY, 'w'), ensure_ascii=False, indent=1)
    return changed

WD = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
def parse(s):
    if not s: return None
    try: return datetime.datetime.fromisoformat(s)
    except Exception: return None

def fmt_time(e):
    st, en = parse(e.get('start')), parse(e.get('end'))
    if not st: return '时间待定（见官方页）'
    base = f"{st.month}月{st.day}日 {WD[st.weekday()]} {st:%H:%M}"
    if en:
        if en.date() == st.date(): return base + f"–{en:%H:%M}"
        return base + f" – {en.month}月{en.day}日 {en:%H:%M}"
    return base

def fmt_deadline(e):
    dl = parse(e.get('registration_deadline'))
    if not dl: return None
    return f"{dl.month}月{dl.day}日 {dl:%H:%M}"

def venue_line(e):
    v = (e.get('venue') or '').strip()
    dist = (e.get('district') or '').strip()
    city = (e.get('city') or '').strip()
    extras = []
    if city and city not in v: extras.append(city)
    if dist and dist not in v: extras.append(dist)
    line = v
    if extras: line = (line + ' · ' if line else '') + ' · '.join(extras)
    if not line: line = '地点见官方页'
    if len(v) <= 10: line += '（详细地址见官方页）'
    return line

def make_card(e, out_png):
    from PIL import Image, ImageDraw, ImageFont
    import qrcode
    W, H = 1080, 1350
    BG=(13,18,24); PANEL=(18,26,35); PANEL2=(10,15,20); LINE=(31,43,54)
    INK=(220,235,228); MUT=(143,168,156); GRN=(46,230,168); COR=(255,92,0); WHITE=(255,255,255)
    def F(p,s): return ImageFont.truetype(p,s)
    img = Image.new('RGB',(W,H),BG); d = ImageDraw.Draw(img)
    def rr(x,y,w,h,r,fill=None,outline=None,width=1): d.rounded_rectangle([x,y,x+w,y+h],r,fill=fill,outline=outline,width=width)
    def txt(x,y,s,font,fill=INK,anchor='la'): d.text((x,y),s,font=font,fill=fill,anchor=anchor)
    def wrap(s,font,maxw):
        lines,cur = [],''
        for ch in s:
            if d.textlength(cur+ch,font=font) <= maxw: cur += ch
            else: lines.append(cur); cur = ch
        if cur: lines.append(cur)
        return lines
    MX = 72
    txt(MX,64,"> yat's list",F(FMB,44),INK)
    cur_w = d.textlength("> yat's list",font=F(FMB,44))
    d.text((MX+cur_w,64),"_",font=F(FMB,44),fill=GRN)
    city = (e.get('city') or '深圳').strip()
    pill = (city if city != '线上' else '线上') + ' · 活动'
    pw = int(d.textlength(pill,font=F(FB,26))) + 56
    rr(W-MX-pw,58,pw,54,27,outline=GRN,width=2)
    txt(W-MX-pw/2,86,pill,F(FB,26),GRN,anchor='mm')
    d.line([MX,150,W-MX,150],fill=LINE,width=2)
    x = MX
    for c in (e.get('categories') or [])[:3]:
        w = int(d.textlength(c,font=F(FB,26))) + 44
        rr(x,182,w,52,26,fill=PANEL,outline=LINE,width=1)
        txt(x+w/2,209,c,F(FB,26),GRN,anchor='mm'); x += w+16
    txt(W-MX,208,"已核实 · 逐条回官方页核对",F(FR,24),MUT,anchor='ra')
    y = 268
    size = 62
    lines = wrap(e.get('title') or '', F(FB,size), W-2*MX)
    while len(lines) > 3 and size > 44:
        size -= 6; lines = wrap(e.get('title') or '', F(FB,size), W-2*MX)
    for line in lines[:3]:
        txt(MX,y,line,F(FB,size),WHITE); y += size + 24
    rows = [("时间", fmt_time(e)), ("地点", venue_line(e)),
            ("主办", (e.get('organizer') or '见官方页')), ("费用", (e.get('fee') or '票价见官方页'))]
    dl = fmt_deadline(e)
    if dl: rows.append(("报名截止", dl))
    panel_h = 54 + len(rows)*70 + 8
    rr(MX,y+16,W-2*MX,panel_h,18,fill=PANEL)
    iy = y + 54
    for k,v in rows:
        if len(v) > 34: v = v[:33] + '…'
        txt(MX+36,iy,k,F(FB,26),GRN); txt(MX+196,iy,v,F(FR,29),INK); iy += 70
    by = iy + 58
    band_h = 352
    rr(MX,by,W-2*MX,band_h,18,fill=PANEL2,outline=GRN,width=2)
    txt(MX+36,by+34,"不想刷列表？把整个清单喂给你的 Agent",F(FB,33),WHITE)
    txt(MX+36,by+102,"订阅一次，它按自己的巡检节奏替你盯新活动、",F(FR,26),MUT)
    txt(MX+36,by+136,"截止与余位，命中就喊你。",F(FR,26),MUT)
    txt(MX+36,by+188,"$ pip install yatslist",F(FMR,29),GRN)
    for j,(lab,u) in enumerate([("数据", SITE + "/events.json"), ("说明", SITE + "/AGENTS.md")]):
        yy = by + 242 + j*54
        txt(MX+36,yy,"$ ",F(FMR,29),GRN)
        w1 = d.textlength("$ ",font=F(FMR,29))
        txt(MX+36+w1,yy+2,lab,F(FB,26),GRN)
        w2 = d.textlength(lab,font=F(FB,26))
        txt(MX+52+w1+w2,yy,"  " + u.replace('https://',''),F(FMR,29),GRN)
    short = f"{SITE}/e/{e['id']}"
    qr = qrcode.QRCode(border=1, box_size=10); qr.add_data(short); qr.make()
    qimg = qr.make_image(fill_color=(13,18,24), back_color=(220,235,228)).convert('RGB').resize((196,196), Image.NEAREST)
    img.paste(qimg,(W-MX-196,by+86))
    txt(W-MX-98,by+296,"扫码看本场",F(FR,21),MUT,anchor='ma')
    fy = by + band_h + 40
    txt(MX,fy,"短链接",F(FB,27),GRN); txt(MX+118,fy,short.replace('https://',''),F(FMR,28),GRN)
    txt(W-MX,fy+2,"逐条核实 · 免费无广告",F(FR,24),MUT,anchor='ra')
    txt(MX,fy+52,"© 2026 Yat's List · 深圳活动清单",F(FR,22),MUT)
    os.makedirs(os.path.dirname(out_png), exist_ok=True)
    img.save(out_png)

PAGE = """<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} · Yat's List 深圳活动</title>
<meta name="description" content="{desc}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Yat's List">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="{img}">
<meta property="og:url" content="{page}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{desc}">
<meta name="twitter:image" content="{img}">
<link rel="canonical" href="{page}">
<style>
*{{box-sizing:border-box}}body{{margin:0;background:#0d1218;color:#dcebe4;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}}
.wrap{{max-width:680px;margin:0 auto;padding:28px 20px 48px}}
.brand{{font-family:ui-monospace,Menlo,monospace;font-weight:700;font-size:19px;color:#dcebe4;text-decoration:none}}
.brand i{{color:#2ee6a8;font-style:normal}}
h1{{font-size:26px;line-height:1.4;margin:22px 0 6px}}
.meta{{color:#8fa89c;font-size:13px}}
.card{{background:#121a23;border:1px solid #1f2b36;border-radius:14px;padding:18px;margin-top:18px}}
.row{{display:flex;gap:14px;padding:7px 0;font-size:15px}}
.row b{{color:#2ee6a8;font-weight:600;min-width:74px}}
.sum{{color:#b9cdc2;line-height:1.75;font-size:15px;margin-top:14px}}
.btn{{display:block;text-align:center;background:#FF5C00;color:#fff;font-weight:700;font-size:16px;border-radius:11px;padding:14px;margin-top:20px;text-decoration:none}}
.sub{{border:1px solid rgba(46,230,168,.4);background:#0a0f14;border-radius:14px;padding:18px;margin-top:22px}}
.sub h2{{font-size:17px;margin:0 0 6px}}
.sub p{{color:#8fa89c;font-size:13.5px;line-height:1.7;margin:0 0 12px}}
.cmd{{display:flex;align-items:center;gap:10px;background:#0d1218;border:1px solid #1f2b36;border-radius:9px;padding:10px 12px;font-family:ui-monospace,Menlo,monospace;font-size:13px;color:#2ee6a8;margin-top:8px}}
.cmd button{{margin-left:auto;background:none;border:1px solid rgba(46,230,168,.4);color:#2ee6a8;border-radius:6px;padding:4px 12px;cursor:pointer;font-size:12px}}
.foot{{color:#8fa89c;font-size:12.5px;margin-top:26px;line-height:1.8}}
.foot a{{color:#2ee6a8}}
.chip{{display:inline-block;border:1px solid #1f2b36;background:#121a23;color:#2ee6a8;border-radius:999px;padding:3px 12px;font-size:12.5px;margin-right:8px}}
</style></head><body><div class="wrap">
<a class="brand" href="https://yatslist.com/szevents/">&gt; yat's list<i>_</i></a>
<h1>{title}</h1>
<div class="meta">{cats}<span class="chip">已核实</span></div>
<div class="card">
<div class="row"><b>时间</b><span>{time}</span></div>
<div class="row"><b>地点</b><span>{venue}</span></div>
<div class="row"><b>主办</b><span>{organizer}</span></div>
<div class="row"><b>费用</b><span>{fee}</span></div>
{deadline_row}
<div class="sum">{summary}</div>
<a class="btn" href="{url}" rel="noopener">去官方页报名 →</a>
</div>
<div class="sub"><h2>把整个清单喂给你的 Agent</h2>
<p>一次订阅，之后 130+ 场深圳活动的新增、截止与余位，你的 Agent 按它的巡检节奏替你盯，命中就喊你。</p>
<div class="cmd"><span>$ pip install yatslist</span><button data-copy="pip install yatslist">复制</button></div>
<div class="cmd"><span>$ subscribe: yatslist.com/events.json</span><button data-copy="https://yatslist.com/events.json">复制</button></div>
<div class="cmd"><span>$ 说明文档 yatslist.com/AGENTS.md</span><button data-copy="https://yatslist.com/AGENTS.md">复制</button></div>
</div>
<div class="foot">数据逐条核实自官方页面 · 免费无广告 · <a href="https://yatslist.com/szevents/">查看完整活动清单</a><br>© 2026 Yat's List · Shenzhen events, served to your Agent.</div>
</div>
<script>
document.querySelectorAll('[data-copy]').forEach(function(b){{b.addEventListener('click',function(){{navigator.clipboard&&navigator.clipboard.writeText(b.getAttribute('data-copy'));b.textContent='已复制';setTimeout(function(){{b.textContent='复制'}},1600);}});}});
</script></body></html>
"""

def esc(s):
    return (s or '').replace('&','&amp;').replace('<','&lt;').replace('>','&gt;').replace('"','&quot;')

def make_page(e):
    dl = fmt_deadline(e)
    dl_row = f'<div class="row"><b>报名截止</b><span>{esc(dl)}</span></div>' if dl else ''
    cats = ''.join(f'<span class="chip">{esc(c)}</span>' for c in (e.get('categories') or []))
    desc = (e.get('summary') or '')[:110]
    html = PAGE.format(title=esc(e.get('title')), desc=esc(desc), img=f"{IMG_BASE}/{e['id']}.png",
                       page=f"{SITE}/e/{e['id']}/", cats=cats, time=esc(fmt_time(e)),
                       venue=esc(venue_line(e)), organizer=esc(e.get('organizer') or '见官方页'),
                       fee=esc(e.get('fee') or '票价见官方页'), deadline_row=dl_row,
                       summary=esc(e.get('summary') or ''), url=esc(e.get('url')))
    outdir = os.path.join(REPO, 'e', e['id'])
    os.makedirs(outdir, exist_ok=True)
    open(os.path.join(outdir, 'index.html'), 'w').write(html)

def main():
    data = json.load(open(EVENTS))
    ids_changed = ensure_ids(data)
    if ids_changed or not data.get('schema_version'):
        data['schema_version'] = 2
        json.dump(data, open(EVENTS, 'w'), ensure_ascii=False, indent=1)
    manifest = {}
    if os.path.exists(MANIFEST): manifest = json.load(open(MANIFEST))
    made, skipped = [], []
    os.makedirs(IMG_DIR, exist_ok=True)
    for e in data['events']:
        if e.get('visibility') == 'agent':
            skipped.append(e.get('id')); continue
        payload = {'gen': 2}
        payload.update({k: e.get(k) for k in ['id','title','start','end','venue','district','city','fee','organizer','categories','url','summary','registration_deadline']})
        h = hashlib.md5(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        png = os.path.join(IMG_DIR, e['id'] + '.png')
        page = os.path.join(REPO, 'e', e['id'], 'index.html')
        if manifest.get(e['id']) == h and os.path.exists(png) and os.path.exists(page):
            skipped.append(e['id']); continue
        make_card(e, png); make_page(e)
        manifest[e['id']] = h; made.append(e['id'])
    json.dump(manifest, open(MANIFEST, 'w'), ensure_ascii=False, indent=1)
    import time
    json.dump({'generated_at': time.strftime('%Y-%m-%dT%H:%M:%S+08:00'), 'generated_ids': made},
              open(os.path.join(PRIV, 'share-last-run.json'), 'w'), ensure_ascii=False, indent=1)
    print(f"generated {len(made)}, skipped {len(skipped)}, total {len(data['events'])}")

if __name__ == '__main__':
    main()
