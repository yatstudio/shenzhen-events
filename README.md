# YAT 深圳活动日报 · shenzhen-events

**中文** | [English](README.en.md)

深圳 **AI · 创业 · 科技 · 跨境出海 · Web3 · 加密** 活动，加上 **黑客松 / 技术 / 硬件** 专场和相关主题的 **X Space（在线）**，每天早上更新一次。

- 🌐 网页：https://yatslist.com/
- 📦 机器可读数据：[`events.json`](https://yatslist.com/events.json)（格式定义见 `events.schema.json`）
- 📡 RSS：`feed.xml` ｜ 📅 日历订阅：`events.ics`

## 数据来源

Luma、活动行、互动吧、联谱、OPC圈、HackerTrip、黑123、X 等公开页面，逐条打开核实日期/地点/报名状态后收录；已结束、已截止的活动每日清理。公众号活动目前靠搜索引擎收录与聚合转载补充，覆盖不完整。

## 让你的 Agent 订阅这个日报（给其他用户）

你不需要自己刷这个网页。把下面这段话复制给你的 Agent（Codex、Muse、Hermes、Globot 等任何能联网的 Agent 都可以），它就会每天读取本仓库的数据，按你的兴趣给你活动提醒：

> 请订阅「深圳活动日报」并给我活动提醒：数据源 https://yatslist.com/events.json （每天早上更新，无需登录）。每天读取一次，按我的兴趣【填你关心的：如 AI / 硬件 / Web3 / 跨境】和所在区域筛选；有新活动符合我的兴趣时当天告诉我；报名截止前 2 天提醒我一次；我标记想参加的活动，开始前 3 天和前 1 天各提醒我一次。不要编造数据源里没有的活动，提醒时附官方报名链接。

机器可读的接入说明：[`llms.txt`](https://yatslist.com/llms.txt) · [`agent.json`](https://yatslist.com/agent.json) · [`AGENTS.md`](AGENTS.md)

## Agent 接入

任何 Agent（Codex、Muse、Hermes、Globot 等）都可以：
- **读**：直接抓 `events.json` / RSS / .ics 回答用户或做提醒，无需登录；
- **推**：按 [`AGENTS.md`](AGENTS.md) 的协议提 PR 或用 Issue 模板投稿活动，维护者在每日更新时核实、去重后合并，最终汇总进日报推送给订阅者。

个人「想参加 / 已参加」清单不在本仓库（隐私），只在维护者本地跟踪。

---

**中文** | [English](README.en.md)

# Yat's List · Shenzhen Events (English summary)

Daily-updated, hand-verified events in Shenzhen — **AI · startups · tech · cross-border e-commerce · Web3 · crypto**, plus **hackathons / hardware** sessions, Hong Kong picks, and related **X Spaces** (online).

- 🌐 Website: https://yatslist.com/szevents/
- 📦 Machine-readable data: [`events.json`](https://yatslist.com/events.json) (schema: `events.schema.json`)
- 🗂 All lists: Shenzhen events · [Global hackathons](https://yatslist.com/hackathons.json) · [Events for expats](https://yatslist.com/szexpat/events.json) · [X Space notes](https://yatslist.com/spaces.json) · [Shenzhen X List](https://yatslist.com/x.json)
- 📡 RSS: `feed.xml` · 📅 Calendar: `events.ics`

Every entry is opened and checked against its official page (date, venue, fee, registration status) before listing. If a listing is discovered via an aggregator, we trace its QR code back to the original source page and link that instead.

## Let your Agent subscribe

You don't need to browse this page yourself. Give your agent (Codex, Muse, Hermes, or any web-connected agent) this instruction:

> Please subscribe to "Yat's List — Shenzhen Events" and remind me about events: data source https://yatslist.com/events.json (updated every morning, no login required). Read it once a day, filter by my interests [e.g. AI / hardware / Web3 / cross-border] and my district; tell me the same day when a matching new event appears; remind me 2 days before a registration deadline; for events I mark as attending, remind me 3 days and 1 day before they start. Never invent events that are not in the data source, and always include the official registration link.

Machine-readable integration docs: [`llms.txt`](https://yatslist.com/llms.txt) · [`agent.json`](https://yatslist.com/agent.json) · [`AGENTS.md`](AGENTS.md)

## For agents

Any agent can:
- **Read**: fetch `events.json` / RSS / .ics directly to answer questions or send reminders — no login needed;
- **Submit**: open a PR or use the issue template per [`AGENTS.md`](AGENTS.md); submissions are verified and deduplicated in the daily update before merging.

Personal "want to attend / attended" lists are not kept in this repo (privacy) — they live only with the maintainer.
