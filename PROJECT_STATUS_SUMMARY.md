# Football Bots — Project Status Summary

**Project root:** `football-bots/`  
**Last updated:** 06 Mar 2026

---

## Version policy (semantic versioning)

- **Source of truth:** Each deployable component’s `package.json` `version` field (e.g. **blue_frontier/package.json**, **footy_bot/package.json**). Use **MAJOR.MINOR.PATCH** (semver).
- **Sync:** Version history tables below and [CHANGELOG.md](CHANGELOG.md) are kept in sync with package versions when releasing.
- **Bump:** MAJOR = breaking changes; MINOR = new features; PATCH = fixes only (e.g. DEBUG fixes).

---

## Version history

### Blue Frontier Committee (Everton bot)

| Version | Date       | Changes |
|---------|------------|--------|
| **v3.3** | 03 Mar 2026 | One prediction per match; overwrite warning + confirm. Kickoff lock autopost in score-predictions channel + catch-up; **fixture_results** + MOD view stored result via **/final** (optional everton/opponent). **/listpredictions:** view "Last 2 completed matches" + optional fixture pick. SEED.md cleanup. |
| **v3.2** | 03 Mar 2026 | **/final:** deferReply + editReply (fix "application did not respond"); "At least one correct goal scorer" field; removed full predicted-scorers list. **Scorer points:** _matchedScorers aligned with same normalization/set logic as display (leaderboard consistent). |
| **v3.1** | 03 Mar 2026 | Persistent volume: `DATA_DIR` env (e.g. `/data` on Railway); seed from **seed-predictions.json** (empty table or `SEED_PREDICTIONS=1`); scorer aliases (JOB→Jake O'Brien, Rohl→Merlin Röhl) + diacritic normalization; `/listpredictions` shows next fixture, fallback to fixture with most predictions; mod channels (mod-chat, mod-bot-logs); DB row normalization; **SEED.md**, **DEPLOY.md**, backup-db.js. |
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

Full history: **[CHANGELOG.md](CHANGELOG.md)** (this folder). Workspace-wide entries: [CHANGELOG.md](../CHANGELOG.md) at Discord Bots root.


---

## Current status

| Component           | Status | Notes |
|--------------------|--------|--------|
| **Blue Frontier**  | Ready | **Production (Railway):** repo root, volume `/data`, `DATA_DIR=/data`; Build/Start in **blue_frontier**. **Blue Frontier Lab (local only):** credentials in **blue_frontier/lab/.env.lab** (script sets `DOTENV_CONFIG_PATH`); run `./lab-frontier.sh start|stop|restart` or **run-in-terminal.sh** start/stop/restart/port from repo root; test in **DATPANDA BOT TESTING**. **Alfred:** **updatetbf** = production; **tbflabon** / **tbflabpush** / **tbflaboff** / **tbflabport** = run-in-terminal.sh (opens Terminal with output). **Port prod→lab:** tbflabport or `port-production-to-lab.sh`; if "No DB at /data" use manual backup from Railway running service (see lab README). Lab log tail has timestamps. Seed via **seed-predictions.json** (or `SEED_PREDICTIONS=1`). |
| **Footy Bot**      | Ready | Run from `football-bots`: `cd footy_bot && npm install && npm start`. Wire `fetchScores(league)` to your API for real fixtures. Discord name: **footy_bot**. |
| **core**           | In use | Shared by both bots; no standalone run. |
| **SportRadar**     | Stub | Blue Frontier: set `SPORTRADAR_KEY` and uncomment fetch in `_fetchFinalScore` to enable auto results. |
| **Footy Bot API**  | Stub | Replace `fetchScores(league)` in `footy_bot/index.js` for live fixtures. |

Known issues and fixes: see [DEBUG.md](../DEBUG.md) at Discord Bots root.

---

## Next steps

1. **Production deploy:** Run **updatetbf** (Alfred) when ready; verify **/listpredictions** and **/final** on The Blue Frontier server.
2. **Port production → lab:** If **tbflabport** shows "No DB at /data/predictions.db", get backup from the **running** Railway service (dashboard → service → shell/one-off → `node blue_frontier/backup-db.js`), save base64 to **blue_frontier/lab/production-backup.b64**, then run restore script and start lab (see port script error message or **blue_frontier/lab/README.md**).
3. **Optional:** Run regression checklist in lab before **updatetbf**. Remove `SEED_PREDICTIONS` from Railway Variables if still set.
4. **Test locally**
   - From **football-bots**: `cd blue_frontier && npm install && npm start` (Everton bot). Use `.env` with `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`; optional `MOD_ROLE_ID`, `RESULTS_CHANNEL_ID`, `SPORTRADAR_KEY`.
   - From **football-bots**: `cd footy_bot && npm install && npm start` (Footy Bot). Use `.env` with `FOOTY_BOT_*` or `DISCORD_TOKEN`/`CLIENT_ID`/`GUILD_ID` and `PREDICTIONS_CHANNEL_ID`.
   - Verify slash commands, `!score`, prediction flow, and (for Blue Frontier) `/final` and auto result checker behaviour.

5. **Deploy Everton bot (blue_frontier)** (production)
   - **Primary** Everton bot is **football-bots/blue_frontier**. tbfbot is archived in **+Archive/tbfbot**.
   - If you were deploying from tbfbot (e.g. Railway, GitHub), update the deployment to use **football-bots** as the repo root and **blue_frontier** as the app root (or set start command to `node blue_frontier/index.js` with working directory `football-bots`).
   - Copy over any production `.env` / env vars from the old deployment; ensure `blue_frontier/.env.example` is reflected (e.g. `RESULTS_CHANNEL_ID`, `SPORTRADAR_KEY` if you use them).

6. **Optional**
   - Enable SportRadar: add `SPORTRADAR_KEY` and uncomment the fetch in `blue_frontier/index.js` (`_fetchFinalScore`).
   - Wire Footy Bot fixtures: replace `fetchScores(league)` stub in `footy_bot/index.js` with your sports API.

---

## Handover / Downloads

- **Handover** (e.g. `Downloads/files`, `files (1)`, `files (2)`) has been **fully merged or superseded**. This repo is the source of truth.
- **Python** handover files (Universal Predictor / Footy Bot predecessor, `score_lookup.py`) are **not needed**; the JS version in **football-bots** (footy_bot) replaces them.
- See **HANDOVER_AUDIT.md**, **DOWNLOADS_CHECK.md**, and **FILES_TO_DOWNLOAD_FROM_CLAUDE.md** in this folder for details and cleanup notes.
