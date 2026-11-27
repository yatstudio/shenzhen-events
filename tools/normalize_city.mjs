// 给 events.json 每条活动补 city_id（由 city 推导，见 /cities.json），并把繁体 district 统一成简体
// （district_tw 保持繁体）。幂等：数据已规范时不写文件。用法：node tools/normalize_city.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, loadCities, cityIdOf } from "./cities.mjs";

// 繁体写进了简体 district 字段的已知条目
const DISTRICT_SIMPLIFY = { "銅鑼灣": "铜锣湾" };

const file = join(ROOT, "events.json");
const raw = readFileSync(file, "utf8");
const data = JSON.parse(raw);
const idOf = cityIdOf(loadCities());

let changed = 0;
data.events = (data.events || []).map((e) => {
  if (!e || typeof e !== "object") return e;
  const id = idOf(e);
  const out = {};
  for (const [k, v] of Object.entries(e)) {
    if (k === "city_id") continue;
    // city_id goes right before city: the line above (district) and below (city) rarely change,
    // so a writer's edits to fee/venue don't land next to it and rebase cleanly
    if (k === "city" && id) out.city_id = id;
    out[k] = k === "district" && DISTRICT_SIMPLIFY[v] ? DISTRICT_SIMPLIFY[v] : v;
  }
  if (id && !("city_id" in out)) out.city_id = id; // no `city` key: append
  if (JSON.stringify(out) !== JSON.stringify(e)) changed++;
  return out;
});

const text = JSON.stringify(data, null, 1) + (raw.endsWith("\n") ? "\n" : "");
if (text !== raw) writeFileSync(file, text);
const by = {};
for (const e of data.events) by[e.city_id || "(none)"] = (by[e.city_id || "(none)"] || 0) + 1;
console.log(`normalize_city: ${changed} event(s) updated; ` + Object.entries(by).map(([k, v]) => `${k}=${v}`).join(" "));
