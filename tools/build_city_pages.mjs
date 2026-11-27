// 由 szevents/index.html（模板）+ cities.json + events.json 生成香港页与香港数据：
//   hk/index.html   页面（模板里的城市逻辑由 window.YL_CITY="hk" 打开）
//   hk/feed.xml、hk/events.ics（hk/events.json 数据切片由 tools/build_slices.mjs 生成，内容同 citySlice）
// 用法：node tools/build_city_pages.mjs          生成
//       node tools/build_city_pages.mjs --check  只检查 hk/index.html 是否与生成结果一致（CI 用，不一致 exit 1）
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, loadCities, cityIdOf, citySlice } from "./cities.mjs";
import { publicEvents, buildRss, buildIcs } from "./feeds.mjs";

const CHECK = process.argv.includes("--check");
const SITE = "https://yatslist.com";
const cities = loadCities();
const hk = cities.find((c) => c.id === "hk");

// ---------- page ----------
const TITLE = "Yat's List · 香港活動清單 · AI / 創業 / Web3 / 黑客松";
const DESC = "Yat's List 香港活動清單：香港 AI·創業·科技·Web3·加密活動，每天逐條核實更新；可搜索、按港島 / 九龍 / 新界篩選、收藏，也可讓你的 Agent 訂閱 hk/events.json。";
const OG_TITLE = "香港活動清單 · Hong Kong Events · Yat's List";
const attr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function rep(html, from, to) {
  const n = html.split(from).length - 1;
  if (n !== 1) throw new Error(`build_city_pages: template anchor found ${n}x (expected 1): ${from.slice(0, 90)}`);
  return html.replace(from, () => to);
}

// Text replacements for the static (pre-JS) markup only; <script> bodies are left alone,
// the page script handles its own strings through YL_CITY.
const STATIC_TX = [
  ["https://yatslist.com/events.json", "https://yatslist.com/hk/events.json"],
  ["https://yatslist.com/events.ics", "https://yatslist.com/hk/events.ics"],
  ["https://yatslist.com/feed.xml", "https://yatslist.com/hk/feed.xml"],
  ['href="/events.json"', 'href="/hk/events.json"'],
  ['href="/events.ics"', 'href="/hk/events.ics"'],
  ['href="/feed.xml"', 'href="/hk/feed.xml"'],
  ["深圳活动清单", "香港活动清单"],
  ["深圳+香港", "香港"],
  ["深圳活动日报", "香港活动清单"],
  ["Asia/Shanghai", "Asia/Hong_Kong"],
];
function staticTx(html) {
  return html.split(/(<script\b[\s\S]*?<\/script>)/).map((part, i) => {
    if (i % 2) return part;
    for (const [a, b] of STATIC_TX) part = part.split(a).join(b);
    return part;
  }).join("");
}

function buildPage(tpl) {
  const conf = { id: hk.id, name: hk.name, name_tw: hk.name_tw, name_en: hk.name_en, tz: hk.tz, currency: hk.currency, areas: hk.areas };
  let h = tpl;
  h = rep(h, "<!DOCTYPE html>\n", "<!DOCTYPE html>\n<!-- GENERATED FILE, DO NOT EDIT. Built by tools/build_city_pages.mjs from szevents/index.html + cities.json; edit those and re-run `node tools/build_city_pages.mjs`. -->\n");
  h = rep(h, '<html lang="zh-CN">', '<html lang="zh-TW">');
  h = h.replace(/<title>[^<]*<\/title>/, () => `<title>${attr(TITLE)}</title>`);
  h = h.replace(/<meta name="description" content="[^"]*">/, () => [
    `<meta name="description" content="${attr(DESC)}">`,
    `<link rel="canonical" href="${SITE}/hk/">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:title" content="${attr(OG_TITLE)}">`,
    `<meta property="og:description" content="${attr(DESC)}">`,
    `<meta property="og:url" content="${SITE}/hk/">`,
    '<meta property="og:locale" content="zh_HK">',
    '<meta name="twitter:card" content="summary">',
    `<link rel="alternate" type="application/json" title="香港活動清單 events.json" href="${SITE}/hk/events.json">`,
    `<link rel="alternate" type="application/rss+xml" title="香港活動清單 RSS" href="${SITE}/hk/feed.xml">`,
  ].join("\n"));
  h = rep(h, '<div id="yl-topbar" data-active="szevents">', '<div id="yl-topbar" data-active="szevents" data-lang-default="tw">');
  h = rep(h, '<p class="section-tagline">DAILY · VERIFIED · FOR AGENTS</p>', '<p class="section-tagline">HONG KONG · DAILY · VERIFIED · FOR AGENTS</p>');
  h = h.replace(/(<h2 class="section-title" id="hero-title">)[^<]*(<\/h2>)/, "$1香港活動清單$2");
  h = h.replace(/(<p class="section-subtitle" id="hero-sub">)[^<]*(<\/p>)/, "$1香港活動，餵給你的 Agent 吃。$2");
  h = rep(h, '<a href="/szevents/" data-city="sz" class="on" aria-current="page">深圳</a><a href="/hk/" data-city="hk">香港</a>',
    '<a href="/szevents/" data-city="sz">深圳</a><a href="/hk/" data-city="hk" class="on" aria-current="page">香港</a>');
  h = rep(h, '<div class="ylstat" data-list="events"></div>', '<div class="ylstat" data-list="hk"></div>');
  h = rep(h, 'const ZHURL="https://yatslist.com/events.json";', 'const ZHURL="https://yatslist.com/hk/events.json";');
  h = staticTx(h);
  // city config, before the page's i18n script (which reads it)
  h = rep(h, "<script>\n/* ===== i18n:", `<script>window.YL_CITY="hk";window.YL_CITY_CONF=${JSON.stringify(conf).replace(/</g, "\\u003c")};</script>\n<script>\n/* ===== i18n:`);
  return h;
}

const tpl = readFileSync(join(ROOT, "szevents", "index.html"), "utf8");
const page = buildPage(tpl);
const pageFile = join(ROOT, "hk", "index.html");

if (CHECK) {
  const cur = existsSync(pageFile) ? readFileSync(pageFile, "utf8") : "";
  if (cur !== page) {
    console.error("check-city-pages: hk/index.html is stale or hand-edited. Run: node tools/build_city_pages.mjs");
    process.exit(1);
  }
  console.log("check-city-pages: hk/index.html matches the generator output");
  process.exit(0);
}

// ---------- data ----------
const data = JSON.parse(readFileSync(join(ROOT, "events.json"), "utf8"));
const idOf = cityIdOf(cities);
const hkData = citySlice(hk, data, idOf);
const hkEvents = hkData.events;

mkdirSync(join(ROOT, "hk"), { recursive: true });
const write = (f, s) => {
  const p = join(ROOT, "hk", f);
  if (!existsSync(p) || readFileSync(p, "utf8") !== s) writeFileSync(p, s);
};
write("index.html", page);
const pub = publicEvents(hkData);
write("feed.xml", buildRss(hkData, pub, {
  title: "Yat's List 香港活动清单",
  link: `${SITE}/hk/`,
  description: "香港 AI·创业·科技·Web3·加密活动，每天更新",
}));
write("events.ics", buildIcs(hkData, pub, { prodid: "-//yatslist//hk//CN" }));
console.log(`hk/: index.html + feed.xml (${hkEvents.length} events) + events.ics (${pub.filter((e) => e.start).length} dated)`);
