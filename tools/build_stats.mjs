// 由 git 历史生成 stats.json：每张清单的条目数、每天新增数（按条目第一次出现在数据文件里的时间算）。
// 用法：node tools/build_stats.mjs   （需要完整 git 历史；CI 里用 fetch-depth: 0）
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] });
const TZ = "Asia/Shanghai";
const day = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

// file: data file; arr: list field; keys: identity fields (any match = same item); keep: which current items count as listed
const LISTS = {
  events: { file: "events.json", arr: (d) => d.events, keys: ["id", "url"], keep: (x) => x.visibility !== "agent" },
  hackathons: { file: "hackathons.json", arr: (d) => d.hackathons, keys: ["url"] },
  talks: { file: "talks.json", arr: (d) => d.talks, keys: ["url", "id"], also: [["spaces.json", (d) => d.spaces], ["interviews.json", (d) => d.interviews]] },
  vps: { file: "vps.json", arr: (d) => d.plans, keys: ["id"] },
  xlist: { file: "x.json", arr: (d) => d.people, keys: ["handle"] },
  expat: { file: "szexpat/events.json", arr: (d) => d.events, keys: ["id", "url"] },
  remote: { file: "remote.json", arr: (d) => d.jobs, keys: ["id", "url"] },
  nomadlist: { file: "nomadlist.json", arr: (d) => d.cities, keys: ["id"] },
};

function firstSeen(sources, keys) {
  const seen = new Map();
  for (const [file, arr] of sources) {
    const log = git("log", "--reverse", "--format=%H %cI", "--", file).trim();
    if (!log) continue;
    for (const line of log.split("\n")) {
      const [sha, when] = line.split(" ");
      let d;
      try { d = JSON.parse(git("show", `${sha}:${file}`)); } catch { continue; }
      for (const x of arr(d) || []) {
        for (const k of keys) {
          const v = x && x[k];
          if (v && (!seen.has(v) || when < seen.get(v))) seen.set(v, when);
        }
      }
    }
  }
  return seen;
}

const now = new Date();
const today = day(now.toISOString());
const out = { timezone: TZ, today, lists: {} }; // no timestamp: the file only changes when counts or the day change
for (const [name, L] of Object.entries(LISTS)) {
  let cur;
  try { cur = JSON.parse(readFileSync(join(root, L.file), "utf8")); } catch { continue; }
  const items = (L.arr(cur) || []).filter((x) => x && (!L.keep || L.keep(x)));
  const seen = firstSeen([[L.file, L.arr], ...(L.also || [])], L.keys);
  const byDay = {};
  for (const x of items) {
    const ts = L.keys.map((k) => seen.get(x[k])).filter(Boolean).sort()[0];
    const dk = ts ? day(ts) : today; // 还没进历史的（本地未提交）算今天
    byDay[dk] = (byDay[dk] || 0) + 1;
  }
  const days = Object.keys(byDay).sort();
  const first = days[0];
  // 首次导入那天的条目是批量迁移进来的，不算「新增」
  if (first) delete byDay[first];
  const recent = Object.keys(byDay).sort().reverse();
  const last7 = {};
  for (let i = 0; i < 7; i++) {
    const dk = day(new Date(now.getTime() - i * 864e5).toISOString());
    if (byDay[dk]) last7[dk] = byDay[dk];
  }
  out.lists[name] = {
    total: items.length,
    updated_at: cur.updated_at || null,
    new_today: byDay[today] || 0,
    last_new_day: recent[0] || null,
    last_new_count: recent[0] ? byDay[recent[0]] : 0,
    new_7d: Object.values(last7).reduce((a, b) => a + b, 0),
    new_by_day: last7,
  };
}
writeFileSync(join(root, "stats.json"), JSON.stringify(out, null, 2) + "\n");
console.log(Object.entries(out.lists).map(([k, v]) => `${k}: ${v.total} (+${v.new_today} today, last +${v.last_new_count} on ${v.last_new_day})`).join("\n"));
