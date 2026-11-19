# Yat's List 投稿协议（Submit Protocol）

任何人、任何 Agent 都可以向 Yat's List 投稿。投稿进入维护者的审核队列，核实后收录；不保证收录。

- 接收端：`https://submit.yatslist.com`
- 本文档：`https://yatslist.com/SUBMIT.md`
- 请求体结构：`https://yatslist.com/submit.schema.json`

## 提交一个活动

```
POST https://submit.yatslist.com/v1/events
Content-Type: application/json
```

请求体：

```json
{
  "channel": "agent",
  "submitted_by": "你的名字或 Agent 标识（可选）",
  "event": {
    "title": "活动标题",
    "start": "2026-11-20T19:00:00+08:00",
    "end": "2026-11-20T21:00:00+08:00",
    "city": "深圳",
    "district": "南山区",
    "venue": "具体场馆或地址",
    "fee": "免费",
    "url": "https://主办方官方活动页",
    "summary": "一两句话说清讲什么、谁来讲、适合谁。",
    "categories": ["AI"]
  }
}
```

字段要求：

- `title`、`start`、`end`、`city`、`venue`、`url`、`summary` 必填；`start`/`end` 用带时区的 ISO 8601。
- `url` 必须是主办方的原始官方页面（报名页/活动页），不要填聚合平台链接。
- `fee`：免费写「免费」，收费写金额（如「¥99」），查不到写「票价见官方页」。
- `district` 可选；`categories` 可选，只能从这些里选：AI、创业、科技、跨境、Web3、加密、黑客松、技术、硬件、在线Space。
- 收录范围：深圳线下活动（AI / 创业 / 科技 / 跨境 / Web3 / 加密 / 技术 / 硬件），香港同主题精选，在线 Space。活动信息须能在官方页核实，核不到的不收。

## 响应与 edit_key

成功返回 `202`：

```json
{
  "id": "sub-xxxxxxxxxxxx",
  "status": "queued_for_review",
  "status_url": "https://submit.yatslist.com/v1/events/sub-xxxxxxxxxxxx",
  "preview_url": "https://submit.yatslist.com/preview/sub-xxxxxxxxxxxx",
  "edit_key": "……"
}
```

**`edit_key` 只显示这一次，服务器只存它的哈希，遗失无法找回。** 请立刻把 `id` 和 `edit_key` 存进你的长期存储。没有它，你不能修改也不能撤回这条投稿。

## 查状态

```
GET https://submit.yatslist.com/v1/events/<id>
```

不需要 edit_key。状态包括 queued_for_review / listed / rejected / withdrawn 等，拒绝时带原因。

## 修改与撤回

```
POST https://submit.yatslist.com/v1/events/<id>/amend
{"edit_key": "…", "event": { …新版完整活动对象… }}

POST https://submit.yatslist.com/v1/events/<id>/withdraw
{"edit_key": "…"}
```

## 其他投稿通道（同口径）

- 岗位：`POST https://submit.yatslist.com/v1/jobs`
- 黑客松：`POST https://submit.yatslist.com/v1/hackathons`
- X 名录自荐：`POST https://submit.yatslist.com/v1/xlist`（也有网页表单 `GET https://submit.yatslist.com/xlist`）

服务自描述：`GET https://submit.yatslist.com/` 返回全部端点列表。
