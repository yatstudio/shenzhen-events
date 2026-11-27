// 把已结束超过 30 天的活动从 events.json（总表）移到 events-archive.json（归档）。
// 判定：end（没有 end 用 start）早于「今天 0 点（Asia/Shanghai）− 30 天」；start、end 都没有（待定 / 延期）的留在总表，
// 没有 id 的也留在总表（归档按 id 去重，没 id 无法去重）。
// 幂等，且不丢条目：同一 id 同时出现在两个文件时以总表为准（归档里那份删掉；若它仍旧过期，下一步再用总表那份覆盖归档）。
// 外部日更写手若把已归档条目重新写回 events.json，也按这条规则处理。数据没变时不写文件。
// 用法：node tools/archive_events.mjs [--now 2026-12-31T09:00:00+08:00]   （--now 只用于测试）
//       node tools/archive_events.mjs --check   只检查、不写文件：需要移动或去重时 exit 1（CI 用）
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./cities.mjs";

const DAYS = 30;
const DAY = 864e5;
const SH_OFFSET = 8 * 3600e3; // Asia/Shanghai has no DST
const SITE = "https://yatslist.com";

const CHECK = process.argv.includes("--check");
const ni = process.argv.indexOf("--now");
const now = ni > 0 ? Date.parse(process.argv[ni + 1]) : Date.now();
if (Number.isNaN(now)) throw new Error("archive_events: bad --now");
const shMidnight = Math.floor((now + SH_OFFSET) / DAY) * DAY - SH_OFFSET;
const cutoff = shMidnight - DAYS * DAY;

const endMs = (e) => {
  const t = Date.parse((e && (e.end || e.start)) || "");
  return Number.isNaN(t) ? null : t;
};
const isOld = (e) => !!(e && e.id) && endMs(e) !== null && endMs(e) < cutoff;

const masterFile = join(ROOT, "events.json");
const archiveFile = join(ROOT, "events-archive.json");
const masterRaw = readFileSync(masterFile, "utf8");
const master = JSON.parse(masterRaw);
const archiveRaw = existsSync(archiveFile) ? readFileSync(archiveFile, "utf8") : null;
const archive = archiveRaw ? JSON.parse(archiveRaw) : { events: [] };

const events = master.events || [];
const keep = events.filter((e) => !isOld(e));
const moved = events.filter(isOld);
const masterIds = new Set(keep.map((e) => e && e.id).filter(Boolean));
const movedIds = new Set(moved.map((e) => e.id));

// archive = old archive minus anything the master now has (master wins), plus what moves now (overwrites)
const byId = new Map();
for (const e of archive.events || []) {
  if (!e || !e.id || masterIds.has(e.id) || movedIds.has(e.id)) continue;
  byId.set(e.id, e);
}
for (const e of moved) byId.set(e.id, e);
const sortKey = (e) => e.start || e.end || "";
const archived = [...byId.values()].sort((a, b) => (Date.parse(sortKey(a)) - Date.parse(sortKey(b))) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

const dropped = (archive.events || []).filter((e) => e && e.id && masterIds.has(e.id)).length;

if (CHECK) {
  if (moved.length || dropped) {
    console.error(`check-archive: ${moved.length} event(s) in events.json ended before ${new Date(cutoff).toISOString()}, ${dropped} id(s) in both files. Run: node tools/archive_events.mjs`);
    process.exit(1);
  }
  console.log("check-archive: events.json has nothing to archive");
  process.exit(0);
}

// ---------- write master ----------
const nl = (raw) => (raw == null || raw.endsWith("\n") ? "\n" : "");
if (moved.length) {
  master.events = keep;
  writeFileSync(masterFile, JSON.stringify(master, null, 1) + nl(masterRaw));
}

// ---------- write archive ----------
// same top-level shape as events.json; updated_at only moves when the archived events change
const sameEvents = archiveRaw && JSON.stringify(archive.events || []) === JSON.stringify(archived);
const shIso = (ms) => new Date(ms + SH_OFFSET).toISOString().replace(/\.\d{3}Z$/, "+08:00");
const out = {
  updated_at: sameEvents && archive.updated_at ? archive.updated_at : shIso(Date.now()),
  city: master.city,
  archived: true,
  note: `已结束超过 ${DAYS} 天的活动归档（结构同 ${SITE}/events.json，每条同样带 city_id）。由 tools/archive_events.mjs 每天从总表移入；同一 id 若又出现在总表，以总表为准。Events that ended more than ${DAYS} days ago, moved here daily from ${SITE}/events.json (same shape).`,
  events: archived,
  schema_version: master.schema_version,
  attribution: master.attribution,
  source: `${SITE}/events.json`,
};
const archiveText = JSON.stringify(out, null, 1) + "\n";
if (archiveText !== archiveRaw) writeFileSync(archiveFile, archiveText);

console.log(`archive_events: cutoff ${shIso(cutoff)}; moved ${moved.length}, removed ${dropped} archive dup(s) (master wins); events.json ${keep.length}, events-archive.json ${archived.length}`);
