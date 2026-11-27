// 由 events.json 生成 feed.xml（RSS）与 events.ics（日历）。用法：node tools/build_feeds.mjs
// （/hk/ 的 feed.xml 与 events.ics 由 tools/build_city_pages.mjs 生成）
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { publicEvents, buildRss, buildIcs } from "./feeds.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(join(root, "events.json"), "utf8"));
const events = publicEvents(data);

writeFileSync(join(root, "feed.xml"), buildRss(data, events, {
  title: "YAT 深圳活动日报",
  link: "https://yatslist.com/",
  description: "深圳 AI·创业·科技·跨境·Web3·加密活动 + 黑客松/硬件 + X Space，每天更新",
}));
writeFileSync(join(root, "events.ics"), buildIcs(data, events));
console.log(`feed.xml + events.ics generated from ${events.length} events`);
