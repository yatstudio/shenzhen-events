#!/usr/bin/env python3
"""香港活动三语翻译：为 hkevents.json 中缺失/语言不对的 *_zh / *_tw / *_en 字段生成译文，写入缓存。

缓存 data/i18n-cache/hkevents.json 以 事件 id 为键，记录源文本 hash；源文本变了才重译。
译文由 tools/apply_hk_i18n.mjs 回填到 hkevents.json（本脚本不改 hkevents.json）。

引擎：默认调用 `claude -p --model sonnet`（Claude Code CLI，读 stdin 出 stdout）。
可用环境变量 HK_I18N_CMD 换成任何「stdin 读提示词、stdout 输出 JSON」的命令。
繁体：由简体译文经 OpenCC s2hk 转换（pip install opencc-python-reimplemented）。

用法：python3 tools/translate_hk.py [--batch 20] [--jobs 4] [--limit N] [--dry-run]
"""
import argparse
import concurrent.futures as cf
import hashlib
import json
import os
import re
import shlex
import subprocess
import sys
import threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "hkevents.json")
CACHE = os.path.join(ROOT, "data", "i18n-cache", "hkevents.json")
CMD = os.environ.get("HK_I18N_CMD", "claude -p --model sonnet")

CJK = re.compile(r"[\u3400-\u9fff]")
LAT = re.compile(r"[A-Za-z]")


def zh_ok(s):
    """中文字段合格：有汉字，且汉字数 ×2 ≥ 拉丁字母数（排除「英文为主夹几个汉字」）。"""
    if not s:
        return False
    c = len(CJK.findall(s))
    return c > 0 and c * 2 >= len(LAT.findall(s))


def en_ok(s):
    return bool(s) and not CJK.search(s)


def src_hash(e):
    src = "\x1f".join(str(e.get(k) or "") for k in ("title", "summary", "venue", "organizer"))
    return hashlib.sha1(src.encode("utf-8")).hexdigest()[:12]


def needs(e):
    """返回本条需要模型翻译的目标字段（简体 + 英文；繁体由简体派生）。"""
    n = []
    if not zh_ok(e.get("title_zh")) or not zh_ok(e.get("title_tw")):
        n.append("title_zh")
    if not en_ok(e.get("title_en")):
        n.append("title_en")
    if e.get("summary"):
        if not zh_ok(e.get("summary_zh")) or not zh_ok(e.get("summary_tw")):
            n.append("summary_zh")
        if not en_ok(e.get("summary_en")):
            n.append("summary_en")
    v = e.get("venue") or ""
    if v and not zh_ok(v) and not zh_ok(e.get("venue_zh")):
        n.append("venue_zh")
    if v and CJK.search(v) and not en_ok(e.get("venue_en")):
        n.append("venue_en")
    o = e.get("organizer") or ""
    if o and CJK.search(o) and not en_ok(e.get("organizer_en")):
        n.append("organizer_en")
    return n


PROMPT = """You translate Hong Kong event listings for a trilingual site (Simplified Chinese / Traditional Chinese (HK) / English).
For each event in the input JSON array, produce ONLY the fields listed in its "need" array:
- title_zh / summary_zh / venue_zh: natural Simplified Chinese. Keep brand, product, organisation and event-series names in their original form where that is how people refer to them (e.g. "Hong Kong Web3 Festival", "FITFAM", "MAAP", "Meetup"), but the sentence itself must be Chinese. Use the standard Chinese names for Hong Kong places (尖沙咀, 中环, 铜锣湾, 麦理浩径, 中山纪念公园…). Separate title parts with "｜". Example: "8am Free HIIT Workout at SYS Park | FITFAM Hong Kong" -> "早上 8 点 中山纪念公园免费 HIIT 训练｜FITFAM Hong Kong".
- title_en / summary_en / venue_en / organizer_en: English. If the source is already English keep it (light cleanup only: drop duplicated Chinese parts, fix spacing). If the source is Chinese or bilingual, translate/extract the English.
- Summaries: keep facts, times, dates, prices, names, requirements. Drop URLs, phone numbers, hashtags and emoji. Condense long marketing text to at most 140 Chinese characters / 240 English characters.
- If a source mixes Chinese and English saying the same thing, use the matching-language part.
- title_zh and summary_zh MUST be readable Chinese: Chinese characters must make up most of the text (at least 1 Chinese character per 3 Latin letters). If the source is only a name (a brand, an event name, a person), add a short factual Chinese descriptor based on the other fields, e.g. "VXCON 2026" -> "VXCON 2026 动漫游戏展", "Founders Running Club :: Hong Kong" -> "创业者跑团 Founders Running Club｜香港", a summary that is only artist names -> "参与艺术家：…". If the summary is meaningless (e.g. "."), give a one-sentence Chinese description from the title.
- venue_zh: Chinese name/address if one exists or the place is a public landmark; for a shop/brand with no Chinese name, return the original name unchanged.
- Never invent details not in the source.
Output ONLY a JSON object mapping each event "id" to an object with the requested fields. No markdown fences, no commentary.

Input:
"""


def call_engine(batch):
    items = []
    for e, n in batch:
        it = {"id": e["id"], "need": n, "title": e.get("title")}
        for k in ("summary", "venue", "organizer"):
            if e.get(k):
                it[k] = e[k]
        items.append(it)
    prompt = PROMPT + json.dumps(items, ensure_ascii=False)
    for attempt in range(3):
        p = subprocess.run(shlex.split(CMD), input=prompt, capture_output=True, text=True, timeout=900)
        out = p.stdout
        i, j = out.find("{"), out.rfind("}")
        if p.returncode == 0 and i >= 0 and j > i:
            try:
                return json.loads(out[i : j + 1])
            except json.JSONDecodeError:
                pass
        sys.stderr.write(f"engine attempt {attempt + 1} failed (rc={p.returncode}): {p.stderr[-300:]}\n")
    return {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--batch", type=int, default=20)
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    import opencc  # opencc-python-reimplemented

    s2hk = opencc.OpenCC("s2hk")
    events = json.load(open(DATA, encoding="utf-8"))["events"]
    cache = json.load(open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {}

    todo = []
    for e in events:
        h = src_hash(e)
        c = cache.get(e["id"])
        n = needs(e)
        if c and c.get("src") == h:
            n = [f for f in n if f not in c]  # 已有缓存的字段不再翻
        if n:
            todo.append((e, n))
    if a.limit:
        todo = todo[: a.limit]
    print(f"{len(todo)} events need translation", file=sys.stderr)
    if a.dry_run or not todo:
        return

    lock = threading.Lock()
    batches = [todo[i : i + a.batch] for i in range(0, len(todo), a.batch)]

    def save():
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        tmp = CACHE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(dict(sorted(cache.items())), f, ensure_ascii=False, indent=1)
            f.write("\n")
        os.replace(tmp, CACHE)

    def run(batch):
        res = call_engine(batch)
        got = 0
        with lock:
            for e, n in batch:
                r = res.get(e["id"]) or {}
                h = src_hash(e)
                c = cache.get(e["id"])
                if not c or c.get("src") != h:
                    c = {"src": h}
                for f in n:
                    v = (r.get(f) or "").strip() if isinstance(r.get(f), str) else ""
                    if f == "venue_zh":
                        ok = bool(v)  # 无中文名的店名可原样保留
                    else:
                        # 模型产出的中文：含汉字且不是原封不动的英文源即可（保留品牌名的标题汉字占比可能偏低）
                        src = e.get(f.rsplit("_", 1)[0]) or ""
                        ok = (bool(CJK.search(v)) and (v != src or bool(CJK.search(src)))) if f.endswith("_zh") else en_ok(v)
                    if not ok:
                        continue
                    c[f] = v
                    if f.endswith("_zh"):
                        c[f[:-3] + "_tw"] = s2hk.convert(v)
                    got += 1
                if len(c) > 1:
                    cache[e["id"]] = c
            save()
        return got

    done = 0
    with cf.ThreadPoolExecutor(a.jobs) as ex:
        for got in ex.map(run, batches):
            done += 1
            print(f"batch {done}/{len(batches)}: +{got} fields", file=sys.stderr)


if __name__ == "__main__":
    main()
