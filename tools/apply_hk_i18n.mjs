#!/usr/bin/env node
// 把 data/i18n-cache/hkevents.json 的三语译文回填到 hkevents.json。幂等：跑两次无 diff。
// 只写 *_zh / *_tw / *_en 字段；只在现有值缺失或语言不对时覆盖；源文本 hash 对不上的缓存条目跳过（需重译）。
// 译文生成见 tools/translate_hk.py。用法：node tools/apply_hk_i18n.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "hkevents.json");
const CACHE = join(ROOT, "data", "i18n-cache", "hkevents.json");

const CJK = /[\u3400-\u9fff]/g;
const LAT = /[A-Za-z]/g;
const cnt = (s, re) => (s.match(re) || []).length;
const zhOk = (s) => !!s && cnt(s, CJK) > 0 && cnt(s, CJK) * 2 >= cnt(s, LAT);
const enOk = (s) => !!s && cnt(s, CJK) === 0;
const srcHash = (e) =>
  createHash("sha1")
    .update(["title", "summary", "venue", "organizer"].map((k) => (e[k] == null ? "" : String(e[k]))).join("\x1f"))
    .digest("hex")
    .slice(0, 12);

// 香港十八区英文名（district 为简体，district_tw 已由上游填好）
const DISTRICT_EN = {
  中西区: "Central and Western", 湾仔区: "Wan Chai", 东区: "Eastern", 南区: "Southern",
  油尖旺区: "Yau Tsim Mong", 深水埗区: "Sham Shui Po", 九龙城区: "Kowloon City", 黄大仙区: "Wong Tai Sin",
  观塘区: "Kwun Tong", 荃湾区: "Tsuen Wan", 屯门区: "Tuen Mun", 元朗区: "Yuen Long", 北区: "North",
  大埔区: "Tai Po", 西贡区: "Sai Kung", 沙田区: "Sha Tin", 葵青区: "Kwai Tsing", 离岛区: "Islands",
};

const raw = readFileSync(DATA, "utf8");
const doc = JSON.parse(raw);
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};

let changed = 0, stale = 0;
const set = (e, k, v) => {
  if (v == null || e[k] === v) return;
  changed++;
  if (k in e) { e[k] = v; return; }
  // 新字段（如 venue_zh）插到同组 *_tw 之前，保持字段顺序稳定、diff 干净
  const anchor = k.replace(/_(zh|en)$/, "_tw");
  const entries = Object.entries(e);
  const i = entries.findIndex(([key]) => key === anchor);
  entries.splice(i < 0 ? entries.length : i, 0, [k, v]);
  for (const key of Object.keys(e)) delete e[key];
  Object.assign(e, Object.fromEntries(entries));
};

for (const e of doc.events) {
  if (e.district && !enOk(e.district_en) && DISTRICT_EN[e.district]) set(e, "district_en", DISTRICT_EN[e.district]);

  const c = cache[e.id];
  if (!c) continue;
  if (c.src !== srcHash(e)) { stale++; continue; }
  for (const base of ["title", "summary", "venue", "organizer"]) {
    if (base !== "title" && !e[base]) continue;
    // 只替换缺失或语言不对的字段；已经合格的（人工/上游写的）不动
    for (const l of ["zh", "tw"]) if (c[`${base}_${l}`] && !zhOk(e[`${base}_${l}`])) set(e, `${base}_${l}`, c[`${base}_${l}`]);
    if (c[base + "_en"] && !enOk(e[base + "_en"])) set(e, base + "_en", c[base + "_en"]);
  }
}

if (changed) {
  const indent = raw.match(/^\{\n( +)"/)?.[1] ?? 1;
  writeFileSync(DATA, JSON.stringify(doc, null, indent) + (raw.endsWith("\n") ? "\n" : ""));
}
console.log(`apply_hk_i18n: ${changed} fields updated${stale ? `, ${stale} stale cache entries skipped (rerun tools/translate_hk.py)` : ""}`);
