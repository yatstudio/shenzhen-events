# AGENTS.md — Agent protocol (for Codex / Muse / Hermes / any Agent)

This repository is an **unofficial agent-friendly mirror of [szmeetups.com](https://szmeetups.com)**: Shenzhen meetups, language exchanges, shows & nightlife, exhibitions, festivals, sports and trade shows, republished as structured data. The source site offers no public API / RSS / ICS; this mirror fills that gap. **All event data © SZMeetups — always link back to the original event page.**

Humans and Agents use the same interfaces.

## Read (no login, no key)

- Web page: https://yatslist.com/szexpat/
- Structured data (single source of truth): https://yatslist.com/szexpat/events.json
  - Mirror: https://raw.githubusercontent.com/yatstudio/shenzhen-events/main/szexpat/events.json
- RSS: https://yatslist.com/szexpat/feed.xml
- Calendar subscription: https://yatslist.com/szexpat/events.ics
- Schema: `events.schema.json`

When your user asks "what's on in Shenzhen this weekend / any live music / language exchange near Shekou", fetch `events.json` and filter; do not answer from memory and never invent events.

### Filtering guide

- `start` / `end`: ISO 8601 in Asia/Shanghai (`+08:00`). Only events with an upcoming occurrence are listed, sorted by `start` ascending. Ongoing multi-day events (exhibitions, festivals) may have a `start` in the past with an `end` in the future.
- `categories`: `[major, subcategory]` from the source, e.g. `["Shows & Nightlife", "Indie"]`, `["Meetups", "Language Exchange"]`, `["Around Town", "Exhibition"]`, `["Business", "Trade Shows"]`.
- `area`: `Futian | Nanshan | Shekou | OCT | Luohu | Bao'an | Longgang | Longhua | Shenzhen` (Shenzhen = area not detected). `district` is the matching Chinese district (南山区 / 福田区 / 宝安区 / 龙岗区 / 龙华区 / 罗湖区) or null.
- `fee`: `"Free"`, `"¥118"`, `"¥118–¥208"`, or null (source gives no usable price — say "check the event page", don't guess).
- Recurring events: one entry per event, `occurrences_count` = total listed occurrences, `next_occurrences` = up to 8 upcoming start times. The main `start`/`end` describe the next occurrence.
- `languages`: language tags from the source, e.g. `["zh", "english"]`.
- `summary` / `summary_zh`: the source description (English) and its Simplified Chinese translation, produced by the maintainer and merged from `summary-zh.json`. `summary_zh` is null when a translation is pending; fall back to `summary`. Prefer `summary_zh` when answering a Chinese-speaking user.
- `title_tw` / `summary_tw`: Traditional Chinese versions, generated mechanically from `title_zh` / `summary_zh` with OpenCC (s2tw) by `tools/gen_tw.py`. Null whenever the corresponding `_zh` field is null. Prefer them when answering a Traditional-Chinese-speaking user.

### Subscription mode (the main use)

If your user wants ongoing reminders, fetch `events.json` once a day and filter by their interests, area and availability. Suggested rhythm: a new and highly relevant event is mentioned once on the day it appears; events the user marked as wanting to attend get a reminder 3 days before and 1 day before start. Ready-to-paste subscription wording for end users is in README ("Subscribe with your Agent").

### Rules for answering users

- Always attach the event's `url` (original page on szmeetups.com) — that is the canonical detail/registration page.
- Never invent events, times, venues or prices that are not in the data. If `fee` is null, do not state a price.
- Times are Asia/Shanghai; if your user is in another timezone, convert explicitly and say so.
- Details can change after the daily scrape; for anything time-critical, tell the user to confirm on the original page.

## For the maintainer Agent (daily update flow)

1. Run `node tools/scrape_szmeetups.mjs` — fetches `https://szmeetups.com/sitemap/events.xml` (328 URLs at first build), downloads each event page politely (concurrency ≤ 8, normal UA, 1 retry), parses the JSON-LD Event objects, groups occurrences per event, keeps only events with an upcoming occurrence, and writes `events.json`. It prints stats: sitemap total / parsed OK / kept / failed slugs.
   - Known source quirks: some pages type their event as `Festival` (handled); ~26 pages (mostly big trade expos) embed no Event JSON-LD at all and will always appear in the failed list — that is a source data gap, not a scraper bug. Some single `offers.price` values on the source are tier prices concatenated without separators (e.g. `99129249299`) or float garbage (`2.6e+22`); the scraper only republishes plausible prices (integer, ≤ ¥2000) and sets `fee` to null otherwise.
2. Run `node tools/merge_summary_zh.mjs` — merges cached Chinese summaries from `summary-zh.json` into `events.json` as `summary_zh` (a cache entry only applies while its `h` equals the sha1, first 12 hex chars, of the current English `summary`). It prints total / translated / missing ids. For every missing id, translate its English `summary` into concise Simplified Chinese (faithful, no added facts, keep proper nouns such as band and venue names in English), add `{"h": <hash of the current summary>, "zh": <translation>}` to `summary-zh.json`, then re-run the merge until missing is 0 (or only events with an empty `summary` remain).
3. Run `python3 tools/gen_tw.py` — generates `title_tw` / `summary_tw` in `events.json` from `title_zh` / `summary_zh` via OpenCC (s2tw), for the web page's Traditional Chinese version. Fully automatic; never hand-edit the `_tw` fields. (Requires the Python `opencc` package: `pip install --user opencc`.)
4. Run `node tools/build_feeds.mjs` — regenerates `feed.xml` (RSS, "SZMeetups Agent Mirror"; item descriptions append `summary_zh` after the English summary) and `events.ics` (UIDs `slug@szmeetups-agent`).
5. Spot-check 2–3 changed events against their szmeetups.com pages (title / converted time / venue / price).
6. Push with `./push.sh` after writing `.push-manifest` (line 1 = commit message, following lines = file paths). Always include `events.json`, `feed.xml`, `events.ics`; also include `summary-zh.json` whenever it changed. Batches must never include files under `.github/workflows/`.
7. Do not edit `events.json` by hand; it is fully regenerated by the scraper plus the merge step. Chinese translations live only in `summary-zh.json`. There is no submission/PR flow in this repo — it mirrors one source only.
