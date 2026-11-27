// Guard for the shared site shell (/shell.js): every wired page must load it and must not carry
// its own copy of the topbar language select. Run: node tools/check-shell.mjs  (exit 1 on failure)
// --data: also fail when generated data is stale: /<city_id>/events.json slices vs. events.json, and events.json still
// holding events that belong in events-archive.json. Run by the stats workflow after it rebuilds; not by the shell
// workflow, because the daily writer's commits (events.json + e/*.html) are stale by design until the stats bot runs.
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Pages whose topbar comes from /shell.js. Add a page here when you wire it.
const PAGES = [
  "szevents/index.html",
  "hk/index.html",
  "hackathons/index.html",
  "chtf/index.html",
  "tglist/index.html",
  "mushenzhen/index.html",
  "xlist/index.html",
  "talks/index.html",
  "talks/tw/index.html",
  "talks/en/index.html",
  "vps/index.html",
  "btc/index.html",
  "quant/index.html",
  "altruists/index.html",
  "nomadlist/index.html",
];

const errors = [];
if (!existsSync(join(ROOT, "shell.js"))) errors.push("shell.js: missing");
for (const p of PAGES) {
  const f = join(ROOT, p);
  if (!existsSync(f)) { errors.push(`${p}: file missing`); continue; }
  const html = readFileSync(f, "utf8");
  if (!html.includes('src="/shell.js')) errors.push(`${p}: does not load /shell.js`);
  if (!html.includes('id="yl-topbar"')) errors.push(`${p}: missing the <div id="yl-topbar"> placeholder`);
  if (/id=["']langsel["']/.test(html)) errors.push(`${p}: still has its own id="langsel" markup`);
  if (/<div class="topbar[ "]/.test(html)) errors.push(`${p}: still has its own <div class="topbar"> markup`);
}

// hk/index.html is generated from szevents/index.html: fail when it is stale or hand-edited
try {
  execFileSync(process.execPath, [join(ROOT, "tools", "build_city_pages.mjs"), "--check"], { stdio: "pipe" });
} catch (e) {
  errors.push("hk/index.html: stale vs. szevents/index.html; run node tools/build_city_pages.mjs");
}

if (process.argv.includes("--data")) {
  const run = (script, args, msg) => {
    try { execFileSync(process.execPath, [join(ROOT, "tools", script), ...args], { stdio: "pipe" }); }
    catch (e) { errors.push(msg + ": " + String(e.stderr || e.message).trim()); }
  };
  run("build_slices.mjs", ["--check"], "city slices stale");
  run("archive_events.mjs", ["--check"], "events.json not archived");
}

if (errors.length) {
  console.error("check-shell: " + errors.length + " problem(s)\n  " + errors.join("\n  "));
  process.exit(1);
}
console.log(`check-shell: ${PAGES.length} pages use /shell.js`);
