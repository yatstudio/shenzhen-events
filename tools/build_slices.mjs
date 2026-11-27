// 由总表 events.json 生成各城市的数据切片 /<city_id>/events.json：cities.json 里 "slice": true 的城市各一份，
// 只含该城市的活动（结构同 /events.json；city_id 缺失的按 city 推导）。切片只取总表，不含 events-archive.json。
// 只生成数据，不生成网页（香港页见 tools/build_city_pages.mjs）。
// 用法：node tools/build_slices.mjs          生成
//       node tools/build_slices.mjs --check  只检查切片是否与生成结果一致（CI 用，不一致 exit 1）
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, loadCities, cityIdOf, citySlice } from "./cities.mjs";

const CHECK = process.argv.includes("--check");
const cities = loadCities();
const idOf = cityIdOf(cities);
const data = JSON.parse(readFileSync(join(ROOT, "events.json"), "utf8"));

const stale = [];
const done = [];
for (const c of cities.filter((x) => x.slice)) {
  if (!/^[a-z]+$/.test(c.id)) throw new Error(`build_slices: bad city id ${c.id}`);
  const slice = citySlice(c, data, idOf);
  const events = slice.events;
  const text = JSON.stringify(slice, null, 1) + "\n";
  const file = join(ROOT, c.id, "events.json");
  const cur = existsSync(file) ? readFileSync(file, "utf8") : null;
  if (cur === text) { done.push(`${c.id}=${events.length}`); continue; }
  if (CHECK) { stale.push(`${c.id}/events.json`); continue; }
  mkdirSync(join(ROOT, c.id), { recursive: true });
  writeFileSync(file, text);
  done.push(`${c.id}=${events.length} (written)`);
}

if (CHECK && stale.length) {
  console.error(`check-slices: stale ${stale.join(", ")}. Run: node tools/build_slices.mjs`);
  process.exit(1);
}
console.log(`${CHECK ? "check-slices: up to date" : "build_slices"}: ${done.join(" ")}`);
