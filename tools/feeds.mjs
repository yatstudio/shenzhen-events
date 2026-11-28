// RSS / ICS builders shared by build_feeds.mjs (site-wide feeds) and build_slices.mjs (/hk/ feeds).
export const publicEvents = (data) => (data.events || []).filter((e) => e && e.title && e.url && e.visibility !== "agent");

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const icsEsc = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const icsDt = (t) => new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function buildRss(data, events, { title, link, description }) {
  const items = events.map((e) => `  <item>
    <title>${esc(e.title)}</title>
    <link>${esc(e.url)}</link>
    <guid isPermaLink="false">${esc(e.url)}</guid>
    <pubDate>${new Date(data.updated_at || Date.now()).toUTCString()}</pubDate>
    <description>${esc([e.start ? "时间：" + e.start : "", e.venue ? "地点：" + e.venue : "", e.summary || ""].filter(Boolean).join(" ｜ "))}</description>
  </item>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>${title}</title>
  <link>${link}</link>
  <description>${description}</description>
  <lastBuildDate>${new Date(data.updated_at || Date.now()).toUTCString()}</lastBuildDate>
${items}
</channel></rss>
`;
}

// 每个活动一条；无结束时间默认 +2 小时
export function buildIcs(data, events, { prodid = "-//shenzhen-events//CN" } = {}) {
  const vevents = events.filter((e) => e.start).map((e, i) => {
    const start = new Date(e.start);
    const end = e.end ? new Date(e.end) : new Date(start.getTime() + 2 * 3600e3);
    const uid = Buffer.from(e.url).toString("base64url").slice(0, 24) + i + "@shenzhen-events";
    return ["BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${icsDt(data.updated_at || new Date())}`, `DTSTART:${icsDt(start)}`, `DTEND:${icsDt(end)}`,
      `SUMMARY:${icsEsc(e.title)}`, `LOCATION:${icsEsc([e.district, e.venue].filter(Boolean).join(" ") || (e.format || ""))}`,
      `DESCRIPTION:${icsEsc((e.summary || "") + " 报名：" + e.url)}`, `URL:${e.url}`, "END:VEVENT"].join("\r\n");
  }).join("\r\n");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:${prodid}`, "CALSCALE:GREGORIAN", vevents, "END:VCALENDAR", ""].join("\r\n");
}
