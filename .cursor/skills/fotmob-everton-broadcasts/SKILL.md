---
name: fotmob-everton-broadcasts
description: >-
  Polls FotMob for US TV broadcast listings on upcoming Everton Premier League
  fixtures, normalizes station names to short labels (Peacock, USA, ESPN), and
  updates blue_frontier ALL_FIXTURES only when verified data exists. Use when
  the user asks to refresh TV/broadcast info, poll FotMob for Peacock/USA/ESPN,
  or update the Everton fixture list with 📺 lines.
---

# FotMob Everton broadcast polling

Poll FotMob for **US** TV listings on upcoming Everton PL fixtures. Publish to Discord **only** when a verified short label exists.

## When to run

- **Not before ~7–10 days** before matchweek — FotMob `tvguide` / `tvlistings` are often empty earlier (confirmed Aug 2026 for 2026/27 MW1).
- Re-poll weekly from **~14 days out**, then every **2–3 days** inside the final week.
- **Do not** set `broadcast` in `index.js` from guesses or Premier League press releases — FotMob API or verified poll script output only.

## Quick run (lab)

```bash
# Dry-run (default) — prints raw + verified labels, no file writes
node blue_frontier/lab/scripts/poll-fotmob-broadcasts.js

# Wider window
node blue_frontier/lab/scripts/poll-fotmob-broadcasts.js --days=28

# Write verified labels into ALL_FIXTURES
node blue_frontier/lab/scripts/poll-fotmob-broadcasts.js --apply
```

After `--apply`:

1. `node blue_frontier/scripts/regenerate-reference-md.js`
2. Lab: `./blue_frontier/lab/lab-frontier.sh restart`
3. Production: deploy `blue_frontier` when satisfied

## Discord display rule

In `buildFixturesEmbed()` (`blue_frontier/index.js`), **only** when `fixture.broadcast` is set:

```
**MW1.** Everton vs Crystal Palace
　📅 Sat 22 Aug 10:00 AM EDT
　🏟️ Hill Dickinson Stadium
　📺 Peacock
```

- **No** 📺 line when `broadcast` is absent or poll returns unverified data.
- Show the **short** label only — never paste raw FotMob strings.

## FotMob sources (US)

| Endpoint | Use |
|----------|-----|
| `GET /api/data/tvlistings?countryCode=US` | Live/near-live window; keys = matchId → `station.name` |
| `GET /api/data/tvguide?countryCode=ENG` | ~7-day guide; `matches[].channels[].name` (UK names; cross-check US via tvlistings) |

`tvlistings?countryCode=US&ids=…` **does not filter** — always fetch the full US listing and index by matchId.

Map Everton fixtures → FotMob matchId via `teams?id=8668` fixtures (`kickoffUTC` + opponent). Script: `lab/scripts/poll-fotmob-broadcasts.js`.

## Normalization (verify before publish)

Logic lives in `blue_frontier/lib/broadcast-label.js`. **Never publish** unless `normalizeBroadcastLabel()` returns non-null.

| Raw FotMob token (examples) | Published label |
|----------------------------|-----------------|
| Peacock, Paramount+ (US), PEACOCKTV | **Peacock** |
| USA Network, USA NETWORKS | **USA** |
| ESPN, ESPN Deportes, ESPN Unlimited | **ESPN** |
| Telemundo | **Telemundo** |
| TUDN | **TUDN** |
| FOX Sports, FOX One, FOX Deportes | **FOX** |
| CBS Sports Network, CBS Sports Golazo | **CBS** |

Compound strings (split on `/`, `,`, ` and `):

| Raw | Published |
|-----|-----------|
| `USA NETWORKS/TUDN/TELEMUNDO/PEACOCKTV` | `USA · Telemundo · TUDN` (Peacock also maps; priority caps at 3) |
| `ESPN` + `ESPN Deportes` | `ESPN` |

Rules:

1. Every token must map to the allowlist in `broadcast-label.js`.
2. If **any** token is unrecognized, **omit the whole fixture** (do not publish partial raw text).
3. Multiple outlets → join with ` · `, max **3** labels, order by `DISPLAY_PRIORITY` (Peacock first).
4. Extend `CANONICAL` in `broadcast-label.js` before publishing new network names.

## Manual MCP check (optional)

When the poll script is inconclusive, use FotMob MCP:

```
fetch_fotmob_route("tvlistings", {"countryCode": "US"})
fetch_fotmob_route("teams", {"id": "8668", "ccode3": "ENG"})
```

Pass raw `station.name` values through `normalizeBroadcastLabel()` in Node before editing `index.js`.

## Editing ALL_FIXTURES

Add or update **only** when verified:

```js
{
  id: "MW1", kickoffUTC: "2026-08-22T14:00:00Z", label: "Sat 22 Aug 10:00 AM EDT",
  competition: "premier_league",
  home: "Everton", away: "Crystal Palace", opponent: "Crystal Palace",
  evertonHome: true, venue: "Hill Dickinson Stadium", srMatchId: null,
  broadcast: "Peacock",  // optional — omit until poll verifies
},
```

Remove `broadcast` if FotMob drops listings (rare).

## Checklist before production

- [ ] Dry-run shows `Verified label:` not `(skip — not publishable)`
- [ ] Label matches allowlist (no slashes, no “Paramount+ (US)” verbatim)
- [ ] `/fixtures` in lab shows 📺 line only on fixtures with `broadcast`
- [ ] `regenerate-reference-md.js` run if you extend the markdown table later

## Related files

- `blue_frontier/index.js` — `ALL_FIXTURES`, `buildFixturesEmbed()`
- `blue_frontier/lib/broadcast-label.js` — normalization
- `blue_frontier/lab/scripts/poll-fotmob-broadcasts.js` — poll + optional `--apply`
- `Discord Bots/.cursor/fotmob-mcp.md` — MCP setup
