// 生成各城市的数据切片 /<city_id>/events.json：cities.json 里 "slice": true 的城市各一份（结构同 /events.json，每条带 city_id）。
//   一般城市：只取总表 events.json 里该城市的活动（city_id 缺失的按 city 推导）。
//   有独立全量文件的城市（tools/cities.mjs 的 CITY_BASE，现为 hk → /hkevents.json）：先放全量文件里的活动，
//   再补总表里该城市、全量文件没有的活动（按 id / url / 标题+开始时间去重，全量文件优先）。
//   这类城市另生成 /<city_id>/feed.xml 与 /<city_id>/events.ics（老订阅地址，内容同切片）。
// 切片不含 events-archive.json。页面不在这里生成（香港页 /hkevents/ 手写，/hk/ 是跳转页）。
// 用法：node tools/build_slices.mjs          生成
//       node tools/build_slices.mjs --check  只检查切片是否与生成结果一致（CI 用，不一致 exit 1）
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, loadCities, cityIdOf, citySlice, loadCityBase } from "./cities.mjs";
import { publicEvents, buildRss, buildIcs } from "./feeds.mjs";

const CHECK = process.argv.includes("--check");
const cities = loadCities();
const idOf = cityIdOf(cities);
const data = JSON.parse(readFileSync(join(ROOT, "events.json"), "utf8"));

const stale = [];
const done = [];
function put(rel, text) {
  const file = join(ROOT, rel);
  const cur = existsSync(file) ? readFileSync(file, "utf8") : null;
  if (cur === text) return false;
  if (CHECK) { stale.push(rel); return false; }
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, text);
  return true;
}
for (const c of cities.filter((x) => x.slice)) {
  if (!/^[a-z]+$/.test(c.id)) throw new Error(`build_slices: bad city id ${c.id}`);
  const base = loadCityBase(c);
  const slice = citySlice(c, data, idOf, base);
  const w = put(`${c.id}/events.json`, JSON.stringify(slice, null, 1) + "\n");
  let note = `${c.id}=${slice.events.length}`;
  if (base) {
    const s = slice.stats;
    note += ` (base ${s.base} + events.json ${s.master - s.overlap}; ${s.overlap} of ${s.master} events.json item(s) already in base)`;
    const pub = publicEvents(slice);
    const label = c.name_en || c.name;
    put(`${c.id}/feed.xml`, buildRss(slice, pub, {
      title: `Yat's List ${c.name}活动清单`,
      link: c.page_url || "https://yatslist.com/",
      description: `${c.name}活动清单（${label}），每天更新`,
    }));
    put(`${c.id}/events.ics`, buildIcs(slice, pub, { prodid: `-//yatslist//${c.id}//CN` }));
  }
  done.push(note + (w ? " written" : ""));
}

if (CHECK && stale.length) {
  console.error(`check-slices: stale ${stale.join(", ")}. Run: node tools/build_slices.mjs`);
  process.exit(1);
}
console.log(`${CHECK ? "check-slices: up to date" : "build_slices"}: ${done.join("; ")}`);
