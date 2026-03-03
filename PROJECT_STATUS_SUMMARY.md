# Football Bots — Project Status Summary

**Project root:** `football-bots/`  
**Last updated:** 02 Mar 2026 (later same day — /help + guild command registration)

---

## Version history

### Blue Frontier Committee (Everton bot)

| Version | Date       | Changes |
|---------|------------|--------|
| **v3.0** | 21 Feb 2026 | SQLite persistence (`better-sqlite3`, `data/predictions.db`); auto result checker (polls 1hr 50min after kick-off, 5min retries, `/final` as MOD override); `!score` across 8 leagues with team aliases; `GuildMessages` + `MessageContent` intents; result checker logic moved to **core/result_checker.js**. |
| **v2.0** | Prior       | In-memory predictions; `/predict`, `/fixtures`, `/listpredictions`, `/myprediction`, `/clearprediction`, `/final`. |

### Footy Bot (Discord name: footy_bot)

| Version | Date       | Changes |
|---------|------------|--------|
| **v1.0** (prime) | 21 Feb 2026 | **Renamed from universal_bot to footy_bot** (prime version for documentation). Same feature set: `/predict` (league → team → match → modal), 7-day window, per-match lock at kick-off; `/leaderboard` (per-league + overall, season + all-time); `/resetleaderboard` (admin + confirmation); `!score` via **core/score_lookup.js**; SQLite (predictions, results, points, points_log); 5pt exact / 2pt result / 1pt scorer. Env: `FOOTY_BOT_*`. |

### Shared core

| Version | Date       | Changes |
|---------|------------|--------|
| **v1.0** | 21 Feb 2026 | **core/team_aliases.js** (LEAGUES, LEAGUE_LABELS, TEAM_ALIASES); **core/score_lookup.js** (`!score` handler, 8 leagues); **core/result_checker.js** (auto result checker used by Blue Frontier). |

---

## Changelog

See [CHANGELOG.md](../CHANGELOG.md) at Discord Bots root for workspace-wide entries. Recent football-bots changes:

- **02 Mar 2026** — Blue Frontier: `/help` command (ephemeral); slash commands registered globally **and** per-guild for test + The Blue Frontier (instant visibility); `/help` crash fix (40060 already-acknowledged); `/predict` UX: clearer description (“press Enter, then pick a match from the menu”), subtitle and dropdown placeholder so users know to click the menu then fill the form. Alfred workflow to update the Discord app: keyword **`updatetbf`**. Docs: README + PROJECT_STATUS updated.
- **21 Feb 2026** — Reorganized into football-bots/ (core, blue_frontier, footy_bot). Merged handover v3.0 into Blue Frontier; Footy Bot (renamed from universal_bot, prime v1.0). Primary Everton bot: **blue_frontier**; tbfbot archived in +Archive.

---

## Current status

| Component           | Status | Notes |
|--------------------|--------|--------|
| **Blue Frontier**  | Ready | **Local:** `cd blue_frontier && npm install && npm start`. **Railway:** repo root → Build `cd blue_frontier && npm ci --omit=dev`, Start `cd blue_frontier && node index.js`, `NODE_VERSION=18`. Global slash commands **plus guild-level registration** for test + The Blue Frontier servers (ensures new commands like `/help` appear instantly). **Alfred:** workflow to update the Discord app (commit + push → Railway); keyword **`updatetbf`**. |
| **Footy Bot**      | Ready | Run from `football-bots`: `cd footy_bot && npm install && npm start`. Wire `fetchScores(league)` to your API for real fixtures. Discord name: **footy_bot**. |
| **core**           | In use | Shared by both bots; no standalone run. |
| **SportRadar**     | Stub | Blue Frontier: set `SPORTRADAR_KEY` and uncomment fetch in `_fetchFinalScore` to enable auto results. |
| **Footy Bot API**  | Stub | Replace `fetchScores(league)` in `footy_bot/index.js` for live fixtures. |

Known issues and fixes: see [DEBUG.md](../DEBUG.md) at Discord Bots root.

---

## Next steps

1. **Test locally**
   - From **football-bots**: `cd blue_frontier && npm install && npm start` (Everton bot). Use `.env` with `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`; optional `MOD_ROLE_ID`, `RESULTS_CHANNEL_ID`, `SPORTRADAR_KEY`.
   - From **football-bots**: `cd footy_bot && npm install && npm start` (Footy Bot). Use `.env` with `FOOTY_BOT_*` or `DISCORD_TOKEN`/`CLIENT_ID`/`GUILD_ID` and `PREDICTIONS_CHANNEL_ID`.
   - Verify slash commands, `!score`, prediction flow, and (for Blue Frontier) `/final` and auto result checker behaviour.

2. **Deploy Everton bot (blue_frontier)**
   - **Primary** Everton bot is **football-bots/blue_frontier**. tbfbot is archived in **+Archive/tbfbot**.
   - If you were deploying from tbfbot (e.g. Railway, GitHub), update the deployment to use **football-bots** as the repo root and **blue_frontier** as the app root (or set start command to `node blue_frontier/index.js` with working directory `football-bots`).
   - Copy over any production `.env` / env vars from the old deployment; ensure `blue_frontier/.env.example` is reflected (e.g. `RESULTS_CHANNEL_ID`, `SPORTRADAR_KEY` if you use them).

3. **Optional**
   - Enable SportRadar: add `SPORTRADAR_KEY` and uncomment the fetch in `blue_frontier/index.js` (`_fetchFinalScore`).
   - Wire Footy Bot fixtures: replace `fetchScores(league)` stub in `footy_bot/index.js` with your sports API.

---

## Handover / Downloads

- **Handover** (e.g. `Downloads/files`, `files (1)`, `files (2)`) has been **fully merged or superseded**. This repo is the source of truth.
- **Python** handover files (Universal Predictor / Footy Bot predecessor, `score_lookup.py`) are **not needed**; the JS version in **football-bots** (footy_bot) replaces them.
- See **HANDOVER_AUDIT.md**, **DOWNLOADS_CHECK.md**, and **FILES_TO_DOWNLOAD_FROM_CLAUDE.md** in this folder for details and cleanup notes.
