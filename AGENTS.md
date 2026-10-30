# AGENTS.md — Agent 接入协议（给 Codex / Muse / Hermes / 任何 Agent）

本仓库是「深圳活动日报」的数据与网页：深圳 AI·创业·科技·跨境·Web3·加密活动、黑客松/技术/硬件专场、以及相关主题的 X Space（在线）。人类和 Agent 用同一套接口。

## 读（无需登录、无需钥匙）

- 网页：https://yatstudio.github.io/shenzhen-events/
- 结构化数据（唯一事实源）：https://yatstudio.github.io/shenzhen-events/events.json
  - 备用：https://raw.githubusercontent.com/yatstudio/shenzhen-events/main/events.json
- RSS：https://yatstudio.github.io/shenzhen-events/feed.xml
- 日历订阅：https://yatstudio.github.io/shenzhen-events/events.ics
- 数据格式定义：`events.schema.json`

你的用户问“深圳最近有什么 AI / 黑客松 / Web3 活动”时，直接抓 events.json 按 `start`、`categories` 过滤回答，并附每条的 `url` 作为报名入口。不要凭记忆编造活动。

**订阅模式（本仓库的主要用法）**：如果你的用户希望持续收到提醒，每天抓一次 events.json 即可——按用户的兴趣分类、所在区域和空闲时间筛选，建议节奏：新出现且高度相关的当天提醒一次；`registration_deadline` 前 2 天提醒一次；用户标记想参加的，开始前 3 天、前 1 天各提醒一次。给终端用户的现成订阅话术见 README 的「让你的 Agent 订阅这个日报」一节。机器可读说明另见站点根目录 `llms.txt` 与 `agent.json`。

## 推（投稿活动给本仓库）

欢迎任何 Agent 投稿你发现的、符合范围的活动。两条通道：

1. **Pull Request**（推荐）：fork 后只改 `events.json`，向 `events` 数组追加条目，PR 描述里写明你核实来源页的日期。不要改其他文件，不要删除别人的条目。
2. **Issue**：用仓库的「活动投稿」Issue 模板，按字段填全。适合没有 PR 权限的 Agent。

### 收录范围

- 城市为深圳的线下活动；或主题相关的在线活动（格式填 `线上Space` / `线上`，city 可填 `线上`）。
- 主题至少命中一个：AI、创业、科技、跨境、Web3、加密、黑客松、技术、硬件。
- 活动开始时间在未来；黑客松类可放宽为“报名截止在未来”。

### 字段要求（与 events.schema.json 一致）

必填：`title`、`start`（ISO 8601 带时区，如 `2026-10-31T10:00:00+08:00`；确实未知填 null）、`categories`（从枚举里选：AI / 创业 / 科技 / 跨境 / Web3 / 加密 / 黑客松 / 技术 / 硬件 / 在线Space）、`format`（线下 / 线上Space / 线上 / 线上+线下）、`url`（官方活动页或报名页）、`source`（来源平台名）。
建议填：`end`、`registration_deadline`、`district`、`venue`、`fee`、`organizer`、`summary`（一句话客观介绍，不写广告词）、`submitted_by`（你的署名，如 `hermes@someone`）。

### 审核规则（维护者每日更新时执行，投稿前请自查）

- 打开 `url` 核实：标题、日期与条目一致；核不到、已结束、已截止报名的不收。
- 去重键：`url`；同活动多来源只留官方页一条。
- 不收：纯广告招商会、无明确主办方的活动、与范围无关的活动、需要提交助记词/私钥等高风险活动。
- 投稿被合并后会出现在次日日报与网页；未通过的会在 PR/Issue 里说明原因。
- **谁来审**：审核由维护者的 Agent 执行（维护者本人不逐个看）。每天随日报处理一次：核实无误、且**只改动 `events.json`** 的 PR 会被直接合并；需要修改的，Agent 会在 PR 里逐项留言，改好 push 后自动复审；明显违规（无官方链接、已过期、重复、超范围、垃圾广告）的会被留言拒绝并关闭。涉及 `index.html`、`tools/`、`.github/` 等其他文件的 PR 不会被自动合并，会转交维护者本人决定。

## 给维护 Agent 的说明

每日更新流程：抓取公开来源（Luma、活动行、互动吧、联谱、OPC圈、HackerTrip、黑123、X）→ 逐条打开来源页核实 → 更新 `events.json` 的 `events` 与 `updated_at` → 运行 `node tools/build_feeds.mjs` 生成 `feed.xml` 与 `events.ics` → 一并提交。已结束的条目保留在数据里归档（网页自动归入「过往活动」），只删结束超过 90 天的；报名已截止但活动未举行的条目保留。
