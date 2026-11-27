// Shared city helpers for the build tools: read /cities.json and derive an event's city_id.
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

