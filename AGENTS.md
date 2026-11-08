# AGENTS.md — Agent 接入协议（给 Codex / Muse / Hermes / 任何 Agent）

本仓库是「Yat's List · 深圳活动清单」（原深圳活动日报）的数据与网页：深圳 AI·创业·科技·跨境·Web3·加密活动、黑客松/技术/硬件专场、以及相关主题的 X Space（在线）。人类和 Agent 用同一套接口。

## 读（无需登录、无需钥匙）

- 网页：https://yatslist.com/szevents/（根路径 https://yatslist.com/ 会自动跳转到这里）
- 外国人活动清单：网页 https://yatslist.com/szexpat/ ，数据 https://yatslist.com/szexpat/events.json（该清单自己的协议文件在 `szexpat/AGENTS.md`）
- 结构化数据（唯一事实源）：https://yatslist.com/events.json
  - 备用：https://raw.githubusercontent.com/yatstudio/shenzhen-events/main/events.json
- RSS：https://yatslist.com/feed.xml
- 日历订阅：https://yatslist.com/events.ics
- 数据格式定义：`events.schema.json`
- 命令行 CLI（已发布 PyPI）：`pip install yatslist` 后可用 `yatslist`（深圳活动）、`yatslist hackathons`（黑客松）、`yatslist expat`（外国人活动）、`yatslist spaces`（Space 纪要）、`yatslist search 关键词`（跨清单搜索）在终端直接查询四张清单。
  - 外国人活动数据主地址为 https://yatslist.com/szexpat/events.json ；旧地址 https://yatslist.com/expat/events.json 保留同步兼容副本，供已发布的 CLI 0.1.0 使用，新接入请用主地址。

你的用户问“深圳最近有什么 AI / 黑客松 / Web3 活动”时，直接抓 events.json 按 `start`、`categories` 过滤回答，并附每条的 `url` 作为报名入口。不要凭记忆编造活动。

**订阅模式（本仓库的主要用法）**：如果你的用户希望持续收到提醒，每天抓一次 events.json 即可——按用户的兴趣分类、所在区域和空闲时间筛选，建议节奏：新出现且高度相关的当天提醒一次；`registration_deadline` 前 2 天提醒一次；用户标记想参加的，开始前 3 天、前 1 天各提醒一次。给终端用户的现成订阅话术见 README 的「让你的 Agent 订阅这个日报」一节。机器可读说明另见站点根目录 `llms.txt` 与 `agent.json`。

## 推（投稿活动给本仓库）

欢迎任何 Agent 投稿你发现的、符合范围的活动。两条通道：

1. **Pull Request**（推荐）：fork 后只改 `events.json`，向 `events` 数组追加条目，PR 描述里写明你核实来源页的日期。不要改其他文件，不要删除别人的条目。
2. **Issue**：用仓库的「活动投稿」Issue 模板，按字段填全。适合没有 PR 权限的 Agent。

### 收录范围

- 城市为深圳的线下活动；香港的同主题精选活动也可收录（city 填 `香港`，district 填区域如 中环 / 湾仔）；或主题相关的在线活动（格式填 `线上Space` / `线上`，city 可填 `线上`）。
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

## 黑客松清单投稿（Submitting to the Hackathons page）

黑客松清单页：https://yatslist.com/hackathons/ ，结构化数据：https://yatslist.com/hackathons.json 。它与 events.json 是两个独立文件：投稿黑客松请走这一节，不要把黑客松条目塞进 events.json。

### 收录范围

- 地区：大陆、香港、澳门、台湾的线下比赛，或线上比赛（不限区域）；纯海外线下不收。
- 只收报名未截止的（`deadline` 在未来）；已截止或已结束的不收——专题页只保留可报名的比赛。
- 主题与黑客松 / 创新大赛相关（AI、开发者工具、硬件、Web3 等均可）。

### 字段要求（与 hackathons.json 现有数据一致）

- `title`：比赛名（可带一句卖点，与官方页口径一致）。
- `start` / `end`：比赛开始 / 结束日期，格式 `YYYY-MM-DD`；未知填 null（`end` 多数情况填 null）。
- `deadline`：报名截止日期 `YYYY-MM-DD`（必填，是专题页的排序键）。
- `city`：举办城市（如 `深圳`）；线上比赛填 `线上`。
- `region`：从枚举里选：大陆 / 香港 / 澳门 / 台湾 / 线上。
- `format`：线下 / 线上 / 线上+线下。
- `topics`：主题词数组（如 `["AI", "机器人"]`）。
- `prize`：奖金说明（如 `总奖池 20 万元`）；官方未公布填 null。
- `url`：官方页或报名页链接。
- `detail_url`：来源渠道的详情页链接（如黑123 详情页）；没有独立详情页时与 `url` 相同。
- `source`：来源渠道名（如 `黑123`、`Devpost`、`DoraHacks`，或主办方官方名）。
- `summary`：中文摘要，一两句客观介绍，不写广告词。
- 译文字段（建议同时提供）：`title_en` / `summary_en` / `prize_en` 与 `title_tw` / `summary_tw` / `prize_tw`；源字段为 null 的，对应译文字段也省略。

### 核实要求（投稿前自查）

- 打开官方页逐项核对：报名截止日期、举办地区与城市、形式、奖金，与条目一致；核不到关键信息（尤其是截止日期）的不要投。
- 去重键：`url`；同一比赛多来源只留官方页一条。

### 提交方式

1. **Pull Request**（推荐）：fork 后只改 `hackathons.json`，向 `hackathons` 数组追加条目（一场只提一条 PR），大致按 `deadline` 升序放入；不要改其他文件，不要删除别人的条目。
2. **邮件**：把比赛信息（名称、官方链接、报名截止日期、地区、形式、奖金）发到投稿邮箱 event.submit@yatslist.com 。

### 与每日自动流程的关系

专题数据由维护者的 Agent 每天从黑123、Devpost、lablab.ai、HackerTrip、DoraHacks、AI赛事通、Accupass 等渠道自动抓取、核实并整表刷新。人工投稿的条目会被当作补漏线索处理：维护 Agent 会到官方页复核，合格的并入专题，不合格的会说明原因；若同一比赛之后被上述渠道正式收录，会以渠道核实数据为准合并去重。因此投稿不承诺永久保留——以官方页信息与每日核实结果为准。

## Space 纪要清单（X Space recaps）

Space 纪要清单页：https://yatslist.com/spaces/ ，结构化数据：https://yatslist.com/spaces.json 。这是存档型清单：收录已结束的华语圈 X Space 的中文纪要（结论先行 + 要点），与前三张「未来活动」清单性质不同，不承诺更新节奏。

### 收录范围

- 华语圈 X Space，主题与本站相关：加密 / Web3 / AI / 创业 / 科技 / 投资等。
- 只收已结束、且已有整理好纪要的场次；纪要中的金额、人数、战绩等数字均为发言人现场自述、未经外部核实，条目与页面均带此提醒。

### 字段要求（与 spaces.json 现有数据一致）

- `title`：场次标题；`series`：系列名（如「贤者时间」），非系列填 null；`episode`：系列期次，非系列填 null。
- `date`：举行日期 `YYYY-MM-DD`；`host`：主持（带 X handle）；`guests`：联合主持与主要发言人数组，没有填 `[]`。
- `duration`：时长原文（如 `9 小时 32 分`）。
- `url`：X Space 原链接（形如 `https://x.com/i/spaces/…`）。**音频只放原链接，绝不下载、搬运或托管音频文件。**
- `topics`：主题词数组；`highlights`：纪要要点数组（结论先行，每条一句）。
- 译文字段（建议同时提供）：`title_en` / `highlights_en` 与 `title_tw` / `highlights_tw`（繁体由简体经 OpenCC 机械转换）。

### 提交方式

1. **Pull Request**：fork 后只改 `spaces.json`，向 `spaces` 数组追加条目；维护者会打开 X 原链接核对标题、日期、主持与纪要要点是否属实，核实后合并。
2. **邮件**：把 Space 链接与纪要发到投稿邮箱 event.submit@yatslist.com 。

### 维护口径

本清单由维护者人工整理更新（抓录音、本地转写、整理纪要后录入），没有每日自动流程；新场次随整理进度上线。

## 给维护 Agent 的说明

每日更新流程：抓取公开来源（Luma、活动行、互动吧、联谱、OPC圈、HackerTrip、黑123、X）→ 逐条打开来源页核实 → 更新 `events.json` 的 `events` 与 `updated_at` → 运行 `node tools/build_feeds.mjs` 生成 `feed.xml` 与 `events.ics` → 一并提交。已结束的条目保留在数据里归档（网页自动归入「过往活动」），只删结束超过 90 天的；报名已截止但活动未举行的条目保留。
