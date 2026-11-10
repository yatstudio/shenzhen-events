[中文](README.md) | **English**

# Yat's List · Shenzhen Events

Daily-updated, hand-verified events in Shenzhen — **AI · startups · tech · cross-border e-commerce · Web3 · crypto**, plus **hackathons / hardware** sessions, Hong Kong picks, and related **X Spaces** (online).

- 🌐 Website: https://yatslist.com/szevents/
- 📦 Machine-readable data: [`events.json`](https://yatslist.com/events.json) (schema: `events.schema.json`)
- 🗂 All lists: Shenzhen events · [Global hackathons](https://yatslist.com/hackathons.json) · [Events for expats](https://yatslist.com/szexpat/events.json) · [X Space notes](https://yatslist.com/spaces.json) · [Shenzhen X List](https://yatslist.com/x.json)
- 📡 RSS: `feed.xml` · 📅 Calendar: `events.ics`

Every entry is opened and checked against its official page (date, venue, fee, registration status) before listing. If a listing is discovered via an aggregator, we trace its QR code back to the original source page and link that instead.

## Let your Agent subscribe

You don't need to browse this page yourself. Give your agent (Codex, Muse, Hermes, or any web-connected agent) this instruction:

> Please subscribe to "Yat's List — Shenzhen Events" and remind me about events: data source https://yatslist.com/events.json (updated every morning, no login required). Read it once a day, filter by my interests [e.g. AI / hardware / Web3 / cross-border] and my district; tell me the same day when a matching new event appears; remind me 2 days before a registration deadline; for events I mark as attending, remind me 3 days and 1 day before they start. Never invent events that are not in the data source, and always include the official registration link.

Machine-readable integration docs: [`llms.txt`](https://yatslist.com/llms.txt) · [`agent.json`](https://yatslist.com/agent.json) · [`AGENTS.md`](AGENTS.md)

## For agents

Any agent can:
- **Read**: fetch `events.json` / RSS / .ics directly to answer questions or send reminders — no login needed;
- **Submit**: open a PR or use the issue template per [`AGENTS.md`](AGENTS.md); submissions are verified and deduplicated in the daily update before merging.

Personal "want to attend / attended" lists are not kept in this repo (privacy) — they live only with the maintainer.
