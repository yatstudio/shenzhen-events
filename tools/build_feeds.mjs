// 由 events.json 生成 feed.xml（RSS）与 events.ics（日历）。用法：node tools/build_feeds.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(join(root, "events.json"), "utf8"));
const events = (data.events || []).filter((e) => e && e.title && e.url);
const site = "https://yatstudio.github.io/shenzhen-events/";
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const icsEsc = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const icsDt = (t) => new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

// RSS
const items = events.map((e) => `  <item>
    <title>${esc(e.title)}</title>
    <link>${esc(e.url)}</link>
    <guid isPermaLink="false">${esc(e.url)}</guid>
    <pubDate>${new Date(data.updated_at || Date.now()).toUTCString()}</pubDate>
    <description>${esc([e.start ? "时间：" + e.start : "", e.venue ? "地点：" + e.venue : "", e.summary || ""].filter(Boolean).join(" ｜ "))}</description>
  </item>`).join("\n");
writeFileSync(join(root, "feed.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>YAT 深圳活动日报</title>
  <link>${site}</link>
  <description>深圳 AI·创业·科技·跨境·Web3·加密活动 + 黑客松/硬件 + X Space，每天更新</description>
  <lastBuildDate>${new Date(data.updated_at || Date.now()).toUTCString()}</lastBuildDate>
${items}
</channel></rss>
`);

// ICS（每个活动一条；无结束时间默认 +2 小时）
const vevents = events.filter((e) => e.start).map((e, i) => {
  const start = new Date(e.start);
  const end = e.end ? new Date(e.end) : new Date(start.getTime() + 2 * 3600e3);
  const uid = Buffer.from(e.url).toString("base64url").slice(0, 24) + i + "@shenzhen-events";
  return ["BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${icsDt(data.updated_at || new Date())}`, `DTSTART:${icsDt(start)}`, `DTEND:${icsDt(end)}`,
    `SUMMARY:${icsEsc(e.title)}`, `LOCATION:${icsEsc([e.district, e.venue].filter(Boolean).join(" ") || (e.format || ""))}`,
    `DESCRIPTION:${icsEsc((e.summary || "") + " 报名：" + e.url)}`, `URL:${e.url}`, "END:VEVENT"].join("\r\n");
}).join("\r\n");
writeFileSync(join(root, "events.ics"), ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//shenzhen-events//CN", "CALSCALE:GREGORIAN", vevents, "END:VCALENDAR", ""].join("\r\n"));
console.log(`feed.xml + events.ics generated from ${events.length} events`);
