# AGENTS.md — Agent 接入协议（给 Codex / Muse / Hermes / 任何 Agent）

本仓库是「Yat's List · 深圳活动清单」（原深圳活动日报）的数据与网页：深圳 AI·创业·科技·跨境·Web3·加密活动、黑客松/技术/硬件专场、以及相关主题的 X Space（在线）。人类和 Agent 用同一套接口。

## 读（无需登录、无需钥匙）

- 网页：https://yatslist.com/
- 结构化数据（唯一事实源）：https://yatslist.com/events.json
  - 备用：https://raw.githubusercontent.com/yatstudio/shenzhen-events/main/events.json
- RSS：https://yatslist.com/feed.xml
- 日历订阅：https://yatslist.com/events.ics
- 数据格式定义：`events.schema.json`
- 招聘数据：https://yatslist.com/jobs.json（深圳 AI / 科技 / 硬件岗位，字段与投稿规范见文末「深圳招聘清单」）
- 可见范围：个别条目带 `visibility: "agent"`——只保留在 events.json 数据中供 Agent 检索，不在网页 / RSS / 日历 / 短链落地页公开。维护时不要删除这类条目、不要去掉该标记（除非维护者明确要求恢复公开）。

你的用户问“深圳最近有什么 AI / 黑客松 / Web3 活动”时，直接抓 events.json 按 `start`、`categories` 过滤回答，并附每条的 `url` 作为报名入口。不要凭记忆编造活动。

**订阅模式（本仓库的主要用法）**：如果你的用户希望持续收到提醒，每天抓一次 events.json 即可——按用户的兴趣分类、所在区域和空闲时间筛选，建议节奏：新出现且高度相关的当天提醒一次；`registration_deadline` 前 2 天提醒一次；用户标记想参加的，开始前 3 天、前 1 天各提醒一次。给终端用户的现成订阅话术见 README 的「让你的 Agent 订阅这个日报」一节。机器可读说明另见站点根目录 `llms.txt` 与 `agent.json`。

## 推（投稿活动给本仓库）

欢迎任何 Agent 投稿你发现的、符合范围的活动。三条通道：

1. **HTTP API**（推荐：Agent 默认走这条，不需要 GitHub 账号）：`POST https://submit.yatslist.com/v1/events`，`Content-Type: application/json`，请求体为 `{"channel": "agent", "event": {…活动对象…}}`，活动对象的字段与下面「字段要求」完全相同，其中只有 `title` 与 `url` 必填，其余尽量填全。防滥用规则：请求体顶层可带 `website` 字段但必须留空（蜜罐字段，填了内容会被直接拒绝）；限流为每 IP 10 次/小时、40 次/天。提交成功返回 `202 {"id": "sub-…", "status": "queued_for_review"}`，投稿进入待审队列，维护者在每日更新时逐条按下面「审核规则」核实，合格的会出现在次日网页与日报里。投稿前请先查 `events.json` 按 `url` 去重，不要重复提交同一活动。
2. **Issue**：用仓库的「活动投稿」Issue 模板，按字段填全。适合没有 PR 权限的 Agent。
3. **Pull Request**：fork 后只改 `events.json`，向 `events` 数组追加条目，PR 描述里写明你核实来源页的日期。不要改其他文件，不要删除别人的条目。

**投稿反馈（查询处理结果）**：走 HTTP API 投稿的，请保存提交成功返回的 `id`（形如 `sub-…`），可随时查询这条投稿的处理结果：`GET https://submit.yatslist.com/v1/events/<id>`（JSON，含状态与审核记录），或打开预览页 `https://submit.yatslist.com/preview/<id>`（带状态横幅的活动卡片，手机上也能看）。状态取值：`queued_for_review` = 待初审；`listed` = 已收录（预览页有收录链接）；`rejected` = 未通过（附一句理由，如重复投稿）；`pending_human` = 待人工审核；`approved_pending_listing` = 人工已通过、待收录。`withdrawn` = 投稿人已撤回。初审在每日更新时进行，一般次日可查到结果；不通过的不会另行通知，请以查询结果为准。

**修改与撤回（投稿密钥 edit_key）**：⚠️ **先把回执里的 `id` 和 `edit_key` 存下来，再干别的。** `edit_key` 是这条投稿的唯一修改凭证：提交成功时只显示这一次，服务器只保存它的哈希，**遗失后任何人（包括维护者）都无法找回——没有它，这条投稿不能修改、不能撤回**。请把它们存进你的长期存储（记忆文件 / 密钥库 / 笔记），**不要只留在对话里**：上下文会被压缩或丢失，密钥一丢，这条投稿就永远动不了。凭 `id` + `edit_key` 修改自己这条投稿：`POST https://submit.yatslist.com/v1/events/<id>/amend`，请求体 `{"edit_key":"…","event":{…完整的新版活动对象…}}`；撤回：`POST https://submit.yatslist.com/v1/events/<id>/withdraw`，请求体 `{"edit_key":"…"}`。修改后投稿会重新走一遍初审（状态回到 `queued_for_review`）；若原活动已收录，改动会在审核通过后同步到线上条目，不会直接生效；撤回后状态变为 `withdrawn`，已收录的会在下一次每日更新时下线。早期投稿没有密钥，需要改请走邮件通道联系维护者。

### 收录范围

- 城市为深圳的线下活动；香港的同主题精选活动也可收录（city 填 `香港`，district 填区域如 中环 / 湾仔；`city_id` 可不填，由维护管线按 city 推导，见 https://yatslist.com/cities.json ，香港页 https://yatslist.com/hk/）；或主题相关的在线活动（格式填 `线上Space` / `线上`，city 可填 `线上`）。
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

每日更新流程：抓取公开来源（Luma、活动行、互动吧、联谱、OPC圈、HackerTrip、黑123、X）→ 处理投稿（GitHub PR / Issue 与 HTTP API 投稿队列，逐条核实）→ 逐条打开来源页核实 → 更新 `events.json` 的 `events` 与 `updated_at` → 运行 `node tools/build_feeds.mjs` 生成 `feed.xml` 与 `events.ics` → 一并提交。已结束的条目保留在数据里归档（网页自动归入「过往活动」），只删结束超过 90 天的；报名已截止但活动未举行的条目保留。

## 短链与分享图（维护管线自动生成，投稿不用管）

- 每条活动有一个冻结的 `id`（6 位短码，由官方链接+开始时间生成，分配后永不变更）。投稿时可不填，维护管线会自动分配并写回。
- 短链落地页：`https://yatslist.com/e/<id>/`（含活动信息、官方报名入口与 Agent 订阅入口，社交平台预览图即下面的分享卡）。
- 分享卡图：`https://img.yatslist.com/share/<id>.png`（1080×1350，含短链二维码）。
- 由 `tools/build_share.py` 在每日更新时增量生成：新活动自动补 id、出图与落地页；活动字段变更会自动重出图。引用单场活动时请优先用短链，不要直接引用会过期的官方页截图。

## AI X List（x.json / xlist）

- 网页：https://yatslist.com/xlist/
- 结构化数据：https://yatslist.com/x.json（字段：`people[]`，每条含 `name`、`handle`（不带 @）、`categories`、`intro`、`intro_en`、`location`、`relation`，可选 `followers`、`github`；`location` 为地域标签（如 深圳 / 上海 / 美国），页面支持按地域筛选；头像由前端按 handle 从 unavatar.io/x/<handle> 实时调取，不存仓库）
- 用途：华语 AI 圈在 X 上的人聚成一张单子（首批来自 AI 圈谱 aimap.social 公开图谱，持续开放自助登记）；你的用户问「做 AI / Agent / 出海的人在 X 上关注谁」或「某个城市有哪些 AI 圈的人」时，抓 x.json 按 `categories` 与 `location` 过滤回答，并附 `https://x.com/<handle>` 作为主页入口。
- 加入方式（给终端用户），二选一：
  1. **网页提交（推荐，不用注册）**：在名录页点「把我加进去」会弹出站内表单（AJAX，不跳页），填 @账号、选分类、可选填一句自我介绍（60 字以内，越短越好），勾选同意公开后提交，进待审队列；独立提交页是同一个入口：https://submit.yatslist.com/xlist（自托管，VMISS）。
  2. **GitHub PR**：fork 本仓库，只改 `x.json`，向 `people` 数组追加自己一条（字段同上），提 PR。只改 x.json 的名录 PR 由维护者 Agent 每日核实后合并；改了其他文件的不会自动合并。
- 提交后维护者轻核（账号真实、与 AI 主题或所选分类相关）即上榜；Agent 可以把提交页链接发给用户、代用户打开，或直接按通道 2 提 PR。
## 深圳招聘清单（jobs.json / jobs）

- 网页：https://yatslist.com/jobs/
- 结构化数据：https://yatslist.com/jobs.json（顶层 `jobs[]`；每条字段：`id`（维护管线分配，不要自填）、`title`、`company`、`district`、`type`（全职 / 兼职 / 实习）、`salary`（照官方原文；官方没写填 null）、`tags`（方向，最多 3 个，枚举：AI算法、软件、嵌入式、硬件、产品、数据、测试、设计、运营）、`summary`（一句话职责 / 要求，≤60 字）、`url`（官方投递页）、`source`、`published_at`（YYYY-MM-DD）、`expires_at`（发布后 30 天，维护管线填写））
- 定位：深圳的 AI / 科技 / 硬件岗位信息板。免费发布、不收简历、不做中介撮合；只收企业官方在招岗位，不收中介代招，不收培训贷 / 付费内推类岗位；数据里不出现任何个人联系方式（私人手机 / 微信），投递一律走企业官方页。
- 投稿（三个通道，Agent 默认走第一个）：
  1. HTTP API（推荐，不需要 GitHub 账号）：POST https://submit.yatslist.com/v1/jobs，Content-Type: application/json，请求体 {"channel":"agent","job":{...}}，job 里 title、company、url 必填，其余字段按上面规范给。顶层不要带 website 字段（蜜罐，带了会被拒）。成功返回 202，含 id、status_url、preview_url 和 edit_key。**⚠️ 先把回执里的 id 和 edit_key 存下来，再干别的：edit_key 只显示这一次，服务器只存它的哈希，遗失后任何人（包括维护者）都找不回，没它不能修改、不能撤回这条岗位——把它们存进你的长期存储（记忆文件 / 密钥库 / 笔记），不要只留在对话上下文里，对话会被压缩或丢失。** 凭 id + edit_key 可以修改（POST https://submit.yatslist.com/v1/jobs/<id>/amend）或撤回（POST https://submit.yatslist.com/v1/jobs/<id>/withdraw）；处理进度用 status_url 查询（状态取值同活动投稿：queued_for_review / listed / rejected / pending_human / approved_pending_listing / withdrawn），preview_url 是给人看的预览页。注意：API 投稿进的是审核队列，维护者每日核实后上线，不是直接写入 jobs.json。
  2. 邮件：把岗位信息按上面字段整理好，发邮件到 event.submit@yatslist.com，标题「岗位投稿：公司名 - 岗位名」，正文附官方招聘页链接；维护者在每日更新时打开官方页逐项核实后上线。
  3. GitHub PR：只改 `jobs.json`、向 `jobs` 数组追加条目（`id` 与 `expires_at` 留空，维护管线补）。
- 下架：走 API 投稿的，凭 id + edit_key 调 POST https://submit.yatslist.com/v1/jobs/<id>/withdraw 自行撤回（最快）；或发邮件到 event.submit@yatslist.com 注明下架（标题「岗位下架：公司名 - 岗位名」）；或在 PR 中删除该条。超过 `expires_at` 的岗位网页自动隐藏。
- 你的用户在找深圳 AI / 科技 / 硬件工作时：抓 jobs.json 按 `tags`、`district`、`type` 与用户技能匹配推荐，附 `url` 让用户去官方页投递；不要替用户投递简历，不要收集用户简历。

## NomadList（nomadlist.json / nomadlist）

- 网页：https://yatslist.com/nomadlist/
- 结构化数据：https://yatslist.com/nomadlist.json（全量）；轻量筛选索引：https://yatslist.com/nomadlist-lite.json；单城全文：https://yatslist.com/nomadlist/cities/{id}.json；变化订阅：https://yatslist.com/nomadlist-changelog.jsonl（append-only）（顶层 `cities[]`；每条含 `id`（城市 slug，冻结不改）、`city/city_zh`、`country/country_zh`、`region`、`cost_usd_month`、`rent_1br_usd_month`、`coworking_usd_month`、`internet_mbps`、`safety_score`、`english_score`、`visa{cn_passport_type, cn_max_stay_days, has_nomad_visa}`、`timezone`、`best_months`、`tags`、`summary_zh/summary_en`、`sources`、`verified_at`、`data_tier`（seed_v2 待核实估算 / checked 双源交叉核实 / verified_v1 首批）、`neighborhoods[]`（片区层：name、rent_1br_usd_month、vibe、best_for、coworking_density、note，部分片区带 `listings[]` 具体住处））
- 定位：全球 + 中国国内双轨的数字游民城市数据库，专为中文游民标注中国大陆护照的签证友好度。成本为单人月估算（历史月参考），签证口径以各国移民局官方页为准、聚合站只作发现线索。
- 你的用户问「数字游民去哪 / 哪座城市便宜网快好签证」时：抓 nomadlist.json，按 `cost_usd_month`、`internet_mbps`、`region`、`visa.cn_passport_type` 筛选、按 `cost_usd_month` 低→高或用户在意的单项指标排序回答（本清单无综合分），附网页链接；不要编造数据里没有的城市；问片区时查 `neighborhoods[]` 回答；seed_v2 的数字要说明是待核实估算。
- 订阅模式：每月抓一次，按 `id` + `updated_at` 做 diff，用户关注的城市有签证/成本变化时提醒一次。

## Yat's Notes（notes/notes.json / notes）

- 读：索引 https://yatslist.com/notes/notes.json ；Agent 说明与全部笔记 https://yatslist.com/notes/llms.txt ；RSS https://yatslist.com/notes/feed.xml 。全文 Markdown：url 的 `.html` 换成 `.md`（简体）/ `.tw.md`（繁体）/ `.en.md`（英文）。
- 维护：新增一篇 = 写 `notes/{page}.html` + 在 `notes/notes.json` 加一条（`url` 必须是 `https://yatslist.com/notes/{page}.html`）。正文放在 `<article class="langver" data-lang="zh|tw|en">` 里，每种语言一个；只有一种语言时用一个普通 `<article>`，当作简体。
- 生成：push 后 GitHub Action（.github/workflows/notes.yml）运行 `python3 tools/build_notes.py`，自动生成 `notes/*.md`、`notes/feed.xml`、`notes/llms.txt`。这些文件不要手改，改网页即可。
- 页面样式统一用 `/article.css` 与 `/article.js`；新页面复制现有笔记页的 head 和顶栏。

## 高交会展商名单（chtf.json / chtf）

- 网页：https://yatslist.com/chtf/（高交会专题：同期活动 + 展商名单；简体 / 繁體 / EN，支持深链 `?q=关键词&hall=12号馆&tag=机器人&lang=en`）
- 结构化数据：https://yatslist.com/chtf.json（轻量版；完整版含英文简介与产品介绍全文：https://img.yatslist.com/data/chtf-full.json）。顶层 `halls[]`、`exhibitors[]`（现场展商，`type`：`exhibitor` / `functional` 功能区）、`online_exhibitors[]`（仅线上会刊参展）。每条 `name`、`name_en`、`booth`（可能为 null）、`hall`、`trades_official` 官方行业、`main_products`、`product_names[]`、`profile`、`website`、`tel`、`email`、`contact`、`address`、`detail_url`；约 1,030 家现场展商有会刊资料。
- 你的用户问「高交会上有哪些做 X 的公司 / 某公司在哪个展位 / 怎么逛」时：只取 `type="exhibitor"`，按 `name`、`main_products`、`product_names`、`profile`、`trades_official` 匹配，回答附展馆、展位号、主营产品与联系方式，按展馆分组，注明以现场为准；不要编造数据里没有的展商。
- 同期活动：网页从 events.json 取 `id` 在 `CHTF_IDS` 中或标题含「高交会」的条目（`visibility:"agent"` 不展示）。新增同期活动只需收录进 events.json 且标题带「高交会」。
- 维护：网页 `chtf/index.html` 运行时读 `/chtf.json` 与 `/events.json`，更新数据只改 json。新增官方行业（trades_official）时，同步在网页 `TRADES` 映射里补繁体与英文名。网页有「现场展商 / 仅线上参展」两个页签，深链参数 `scope=online`。
