// Shared city helpers for the build tools: read /cities.json, derive an event's city_id, build per-city slices.
// city_id is derived from the free-text `city` field, because the daily writer does not know city_id.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function loadCities() {
  return JSON.parse(readFileSync(join(ROOT, "cities.json"), "utf8")).cities;
}

const ONLINE_FORMATS = new Set(["线上", "线上Space"]);

// Returns (event) => city id, or null when the city text matches no known city.
export function cityIdOf(cities) {
  const ids = new Set(cities.map((c) => c.id));
  return (e) => {
    const city = String((e && e.city) || "").trim();
    if (city) {
      const lc = city.toLowerCase();
      for (const c of cities) if ((c.match || []).some((m) => lc.includes(m.toLowerCase()))) return c.id;
      return ids.has(e.city_id) ? e.city_id : null;
    }
    if (ids.has(e && e.city_id)) return e.city_id;
    return ONLINE_FORMATS.has(e && e.format) ? "online" : "sz"; // schema default city is 深圳
  };
}


// Cities whose full list lives in its own data file (written by a separate pipeline). Their slice is that file
// plus the master's events for the city that the file doesn't already have (same id, same url, or same title + start).
export const CITY_BASE = { hk: "hkevents.json" };

const normUrl = (u) => String(u || "").trim().toLowerCase().replace(/^http:\/\//, "https://").replace(/:\/\/www\./, "://").replace(/[?#].*$/, "").replace(/\/+$/, "");
const titleStart = (e) => `${String(e.title || "").trim().toLowerCase()}|${String(e.start || "").slice(0, 16)}`;

// Reads the city's base file (null when the city has none or the file is missing)
export function loadCityBase(c) {
  const f = CITY_BASE[c.id];
  if (!f) return null;
  try { return JSON.parse(readFileSync(join(ROOT, f), "utf8")); } catch { return null; }
}

// Per-city slice (/<city_id>/events.json): same shape as /events.json, only this city's events, each with city_id.
// base (optional, see CITY_BASE): its events come first; master events already in base are skipped (base wins).
export function citySlice(c, data, idOf, base = null) {
  const site = "https://yatslist.com";
  const own = (data.events || []).filter((e) => e && idOf(e) === c.id);
  let events = own, overlap = 0;
  if (base) {
    const head = (base.events || []).filter((e) => e && e.title && e.url);
    const ids = new Set(head.map((e) => e.id).filter(Boolean));
    const urls = new Set(head.map((e) => normUrl(e.url)));
    const ts = new Set(head.map(titleStart));
    const extra = own.filter((e) => !((e.id && ids.has(e.id)) || urls.has(normUrl(e.url)) || ts.has(titleStart(e))));
    overlap = own.length - extra.length;
    events = head.concat(extra);
  }
  const baseFile = base && CITY_BASE[c.id];
  const updated = [data.updated_at, base && base.updated_at].filter(Boolean).sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null;
  const slice = {
    updated_at: updated,
    city: c.name,
    city_id: c.id,
    events: events.map((e) => (e.city_id === c.id ? e : { ...e, city_id: c.id })),
    schema_version: data.schema_version,
    attribution: {
      ...(data.attribution || {}),
      name: `Yat's List · ${c.name}活动清单`,
      url: c.page_url || (data.attribution && data.attribution.url) || `${site}/`,
    },
    source: baseFile ? `${site}/${baseFile}` : `${site}/events.json`,
  };
  if (baseFile) slice.sources = [`${site}/${baseFile}`, `${site}/events.json?city_id=${c.id}`];
  Object.defineProperty(slice, "stats", { value: { base: base ? events.length - (own.length - overlap) : 0, master: own.length, overlap }, enumerable: false });
  return slice;
}
