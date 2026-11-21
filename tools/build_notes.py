#!/usr/bin/env python3
"""Yat's Notes: build the agent-readable files from notes/notes.json and the note pages.

Outputs (all generated, do not edit by hand):
  notes/{page}.md / {page}.tw.md / {page}.en.md   full text in Markdown, one per language
  notes/feed.xml                                  RSS, newest first
  notes/llms.txt                                  index for agents: every note with its page and Markdown links

Usage: python3 tools/build_notes.py   (stdlib only; CI runs it on every notes/ push)
"""
import json
import os
import re
from email.utils import format_datetime
from datetime import datetime, timezone, timedelta
from html import escape
from html.parser import HTMLParser

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
NOTES = os.path.join(ROOT, "notes")
SITE = "https://yatslist.com/notes/"
LANGS = ["zh", "tw", "en"]
LANG_NAME = {"zh": "简体", "tw": "繁體", "en": "English"}
SUFFIX = {"zh": ".md", "tw": ".tw.md", "en": ".en.md"}
VOID = {"img", "br", "hr", "meta", "link", "input", "source"}


class Node:
    def __init__(self, tag, attrs, parent=None):
        self.tag, self.attrs, self.parent, self.kids = tag, dict(attrs), parent, []

    def cls(self):
        return (self.attrs.get("class") or "").split()


class Tree(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = self.cur = Node("root", {})

    def handle_starttag(self, tag, attrs):
        n = Node(tag, attrs, self.cur)
        self.cur.kids.append(n)
        if tag not in VOID:
            self.cur = n

    def handle_startendtag(self, tag, attrs):
        self.cur.kids.append(Node(tag, attrs, self.cur))

    def handle_endtag(self, tag):
        n = self.cur
        while n is not self.root and n.tag != tag:
            n = n.parent
        if n is not self.root:
            self.cur = n.parent

    def handle_data(self, data):
        self.cur.kids.append(data)


def find_all(n, pred, out=None):
    out = [] if out is None else out
    for k in n.kids:
        if isinstance(k, Node):
            if pred(k):
                out.append(k)
            find_all(k, pred, out)
    return out


def inline(n):
    """Inline Markdown for a node's children."""
    s = ""
    for k in n.kids:
        if isinstance(k, str):
            s += re.sub(r"\s+", " ", k)
        elif k.tag in ("b", "strong"):
            t = inline(k).strip()
            s += f"**{t}**" if t else ""
        elif k.tag in ("i", "em"):
            t = inline(k).strip()
            s += f"*{t}*" if t else ""
        elif k.tag == "code":
            s += "`" + inline(k).strip() + "`"
        elif k.tag == "a":
            t, h = inline(k).strip(), k.attrs.get("href", "")
            if h.startswith("/"):
                h = "https://yatslist.com" + h
            s += f"[{t}]({h})" if h and t else t
        elif k.tag == "br":
            s += "  \n"
        elif k.tag == "img":
            s += f"![{k.attrs.get('alt', '')}]({k.attrs.get('src', '')})"
        else:
            s += inline(k)
    return s


def blocks(n, out):
    """Block-level Markdown, appended to out (list of paragraphs)."""
    for k in n.kids:
        if isinstance(k, str):
            if k.strip():
                out.append(re.sub(r"\s+", " ", k).strip())
            continue
        c, t = k.cls(), k.tag
        if t in ("script", "style", "nav", "button"):
            continue
        if t in ("h1", "h2", "h3", "h4"):
            out.append("#" * int(t[1]) + " " + inline(k).strip())
        elif t == "p":
            out.append(inline(k).strip())
        elif t in ("ul", "ol"):
            items = [li for li in k.kids if isinstance(li, Node) and li.tag == "li"]
            out.append("\n".join((f"{i + 1}. " if t == "ol" else "- ") + inline(li).strip() for i, li in enumerate(items)))
        elif t == "blockquote" or "lede" in c:
            sub = []
            blocks(k, sub) if any(isinstance(x, Node) and x.tag == "p" for x in k.kids) else sub.append(inline(k).strip())
            out.append("\n".join("> " + line for p in sub for line in p.split("\n")))
        elif t == "img":
            out.append(f"![{k.attrs.get('alt', '')}]({k.attrs.get('src', '')})")
        elif "stats" in c or "nums" in c:
            rows = []
            for cell in find_all(k, lambda x: "stat" in x.cls() or "num" in x.cls()):
                v = find_all(cell, lambda x: "v" in x.cls())
                kk = find_all(cell, lambda x: "k" in x.cls())
                if v:
                    rows.append(f"- **{inline(v[0]).strip()}**" + (f" {inline(kk[0]).strip()}" if kk else ""))
            if rows:
                out.append("\n".join(rows))
        elif "kicker" in c:
            out.append("*" + inline(k).strip() + "*")
        elif "src" in c:
            out.append("---\n\n" + inline(k).strip())
        elif t == "table":
            rows = find_all(k, lambda x: x.tag == "tr")
            cells = [[inline(td).strip().replace("|", "\\|") for td in r.kids if isinstance(td, Node) and td.tag in ("td", "th")] for r in rows]
            if cells:
                w = max(len(r) for r in cells)
                cells = [r + [""] * (w - len(r)) for r in cells]
                out.append("\n".join(["| " + " | ".join(cells[0]) + " |", "|" + " --- |" * w] + ["| " + " | ".join(r) + " |" for r in cells[1:]]))
        elif t in ("div", "section", "figure", "span", "header", "footer", "aside"):
            if any(isinstance(x, Node) and x.tag in ("p", "h2", "h3", "ul", "ol", "div", "img", "table", "blockquote") for x in k.kids):
                blocks(k, out)
            else:
                txt = inline(k).strip()
                if txt:
                    out.append(txt)
        else:
            txt = inline(k).strip()
            if txt:
                out.append(txt)


def articles(html):
    """{lang: article node}. Pages carry <article class="langver" data-lang="zh|tw|en">; a page with one plain <article> is zh."""
    t = Tree()
    t.feed(html)
    found = {}
    for a in find_all(t.root, lambda x: x.tag == "article"):
        lang = a.attrs.get("data-lang") or "zh"
        found.setdefault(lang, a)
    return found


def page_of(note):
    m = re.match(r"https://yatslist\.com/notes/([A-Za-z0-9._-]+)\.html$", note.get("url") or "")
    return m.group(1) if m else None


def pick(note, key, lang):
    return note.get(f"{key}_{lang}") or note.get(key) or ""


def main():
    data = json.load(open(os.path.join(NOTES, "notes.json"), encoding="utf-8"))
    notes = sorted(data.get("notes", []), key=lambda n: n.get("date") or "", reverse=True)
    written, index = set(), []
    for n in notes:
        page = page_of(n)
        path = page and os.path.join(NOTES, page + ".html")
        if not path or not os.path.exists(path):
            print("skip (no local page):", n.get("id"), n.get("url"))
            continue
        arts = articles(open(path, encoding="utf-8").read())
        md = {}
        for lang in LANGS:
            a = arts.get(lang)
            if a is None:
                continue
            # title and kicker go in the header; the rest of the article is the body
            h1 = find_all(a, lambda x: x.tag == "h1")
            kick = find_all(a, lambda x: "kicker" in x.cls())
            title = inline(h1[0]).strip() if h1 else pick(n, "title", lang)
            kicker = inline(kick[0]).strip() if kick else n.get("type", "")
            for x in h1[:1] + kick[:1]:
                x.parent.kids.remove(x)
            out = []
            blocks(a, out)
            L = {"zh": ("网页", "收录日期", "类型", "原文作者", "原文标题", "原文链接"),
                 "tw": ("網頁", "收錄日期", "類型", "原文作者", "原文標題", "原文連結"),
                 "en": ("Page", "Added", "Type", "Original author", "Original title", "Original link")}[lang]
            c = ": " if lang == "en" else "："
            head = [f"<!-- generated by tools/build_notes.py from {n['url']}; do not edit by hand -->", "",
                    f"- {L[0]}{c}{n['url']}", f"- {L[1]}{c}{n.get('date', '')}", f"- {L[2]}{c}{kicker}", f"- {L[3]}{c}{n.get('author', '')}"]
            if n.get("source_title"):
                head.append(f"- {L[4]}{c}{n['source_title']}")
            if n.get("source_url"):
                head.append(f"- {L[5]}{c}{n['source_url']}")
            body = "\n\n".join(p for p in out if p)
            text = "# " + title + "\n\n" + "\n".join(head) + "\n\n" + body.strip() + "\n"
            text = re.sub(r"\n{3,}", "\n\n", text)
            fn = page + SUFFIX[lang]
            with open(os.path.join(NOTES, fn), "w", encoding="utf-8") as f:
                f.write(text)
            written.add(fn)
            md[lang] = SITE + fn
        index.append((n, md))

    # drop Markdown files whose note is gone
    for fn in os.listdir(NOTES):
        if fn.endswith(".md") and fn not in written:
            os.remove(os.path.join(NOTES, fn))

    # RSS
    tz = timezone(timedelta(hours=8))
    def rfc(d):
        try:
            return format_datetime(datetime.strptime(d, "%Y-%m-%d").replace(hour=9, tzinfo=tz))
        except Exception:
            return ""
    upd = data.get("updated_at") or (notes[0].get("date") if notes else "")
    try:
        last = format_datetime(datetime.fromisoformat(upd))
    except Exception:
        last = rfc(upd)
    items = "\n".join(
        f"""  <item>
    <title>{escape(n.get('title', ''))}</title>
    <link>{escape(n['url'])}</link>
    <guid isPermaLink="false">{escape(n.get('id') or n['url'])}</guid>
    <pubDate>{rfc(n.get('date', ''))}</pubDate>
    <description>{escape(n.get('summary', ''))}</description>
  </item>""" for n, _ in index)
    with open(os.path.join(NOTES, "feed.xml"), "w", encoding="utf-8") as f:
        f.write(f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Yat's Notes</title>
  <link>{SITE}</link>
  <description>好文章的 AI 解读，和 Yat 自己的见解。每篇附 Markdown 全文。</description>
  <language>zh-CN</language>
  <lastBuildDate>{last}</lastBuildDate>
{items}
</channel></rss>
""")

    # llms.txt for agents
    lines = [
        "# Yat's Notes · 给 Agent 的说明",
        "",
        "Yat's Notes 是 Yat's List 的一个清单：好文章的 AI 解读，每篇最后都有 Yat 本人的见解。网页 https://yatslist.com/notes/ ，免登录、无钥匙。",
        "",
        "## 怎么读",
        "- 索引：https://yatslist.com/notes/notes.json（顶层 `notes[]`；每条有 id、date、type、title/summary 及 _tw/_en 版本、author、source_title、source_url、url、image）",
        "- 全文：把 url 的 `.html` 换成 `.md` 是简体全文，`.tw.md` 繁体，`.en.md` 英文。Markdown 由网页自动生成，内容与网页一致。",
        "- 订阅：RSS https://yatslist.com/notes/feed.xml ；或每天抓一次 notes.json，按 id 判断新增。",
        "",
        "## 使用规矩",
        "- 转述时附网页链接；引用原文观点时附 source_url。",
        "- 文中「对你的落点」等段落是 Yat 写给自己读者的见解，转述时说明是 Yat 的观点。",
        "- 文中数字多为原文作者口径，页面已注明未逐项核实；不要当成已核实的事实。",
        "- 数据里没有的笔记不要编造。",
        "",
        f"## 全部笔记（{len(index)} 篇，新的在前）",
    ]
    for n, md in index:
        lines += ["", f"### {n.get('title', '')}", f"- {n.get('date', '')} · {n.get('type', '')} · 原文：{n.get('author', '')}",
                  f"- 摘要：{n.get('summary', '')}", f"- 网页：{n['url']}"]
        if md:
            lines.append("- Markdown：" + " · ".join(f"{LANG_NAME[l]} {u}" for l, u in md.items()))
        if n.get("source_url"):
            lines.append(f"- 原文：{n['source_url']}")
    with open(os.path.join(NOTES, "llms.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"notes: {len(index)} notes, {len(written)} markdown files")


if __name__ == "__main__":
    main()
