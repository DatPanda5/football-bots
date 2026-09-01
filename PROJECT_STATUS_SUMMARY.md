# Football Bots — Project Status Summary

**Project root:** `football-bots/`  
**Last updated:** 1 Sep 2026

---

## Version policy (semantic versioning)

- **Source of truth:** Each deployable component’s `package.json` `version` field (e.g. **blue_frontier/package.json**, **footy_bot/package.json**). Use **MAJOR.MINOR.PATCH** (semver).
- **Sync:** Version history tables below and [CHANGELOG.md](CHANGELOG.md) are kept in sync with package versions when releasing.
- **Bump:** MAJOR = breaking changes; MINOR = new features; PATCH = fixes only (e.g. DEBUG fixes).

---

## Version history

### Blue Frontier Committee (Everton bot)


| Version    | Date        | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **v3.6.5** | 28 Aug 2026 | `/predict` cup prefixes: **EFL:** / **FA:** on match menu and modal. |
| **v3.6.4** | 28 Aug 2026 | **EFL Cup R3** vs Wolves (home, 09 Sep 2:45 PM EDT); Wolves squad from FotMob. |
| **v3.5.0** | 19 Jun 2026 | **2026–27 schedule:** 5 pre-season + 38 PL fixtures in `ALL_FIXTURES`; new opponent squads; **26-27fixtures.md** / **squad.md** + `npm run sync-docs`. |
| **v3.4.0** | 17 Apr 2026 | **Derby bonus predictors:** 🟨 yellow cards + 🟥 red cards (1pt each) added to `/predict` modal for `fix07` (Everton vs Liverpool) only. New DB columns auto-migrated on startup. `/final` gains `yellow_cards` and `red_cards` options. All embeds updated to show bonus predictions and results. |
| **v3.3.1** | 16 Mar 2026 | **GUILD_ID** optional; **[predict]** logs username before userId; logPredictError includes username. **Scorer matching:** extra words after name allowed (e.g. "Branthwaite at the death" → Branthwaite); aliases: Ndiaye/Skiliman/Skilliman → Iliman Ndiaye; Keano/BIG MICK/Keggers → Michael Keane. Deploy pipeline check log line removed. **/final UX:** fixture dropdown now shows only the most recent played match plus future fixtures; played status comes from `/final` result (or 48h+ after kickoff). Lab: MOD role ID updated in `.env.lab` for correct permissions. |
| **v3.3**   | 03 Mar 2026 | One prediction per match; overwrite warning + confirm. Kickoff lock autopost in score-predictions channel + catch-up; **fixture_results** + MOD view stored result via **/final** (optional everton/opponent). **/listpredictions:** view "Last 2 completed matches" + optional fixture pick. SEED.md cleanup.                                                                                                                                                                                                                                                                    |
| **v3.2**   | 03 Mar 2026 | **/final:** deferReply + editReply (fix "application did not respond"); "At least one correct goal scorer" field; removed full predicted-scorers list. **Scorer points:** _matchedScorers aligned with same normalization/set logic as display (leaderboard consistent).                                                                                                                                                                                                                                                                                                          |
| **v3.1**   | 03 Mar 2026 | Persistent volume: `DATA_DIR` env (e.g. `/data` on Railway); seed from **seed-predictions.json** (empty table or `SEED_PREDICTIONS=1`); scorer aliases (JOB→Jake O'Brien, Rohl→Merlin Röhl) + diacritic normalization; `/listpredictions` shows next fixture, fallback to fixture with most predictions; mod channels (mod-chat, mod-bot-logs); DB row normalization; **SEED.md**, **DEPLOY.md**, backup-db.js.                                                                                                                                                                   |
| **v3.0**   | 21 Feb 2026 | SQLite persistence (`better-sqlite3`, `data/predictions.db`); auto result checker (polls 1hr 50min after kick-off, 5min retries, `/final` as MOD override); `!score` across 8 leagues with team aliases; `GuildMessages` + `MessageContent` intents; result checker logic moved to **core/result_checker.js**.                                                                                                                                                                                                                                                                    |
| **v2.0**   | Prior       | In-memory predictions; `/predict`, `/fixtures`, `/listpredictions`, `/myprediction`, `/clearprediction`, `/final`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |


### Footy Bot (Discord name: footy_bot)


| Version          | Date        | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **v1.0** (prime) | 21 Feb 2026 | **Renamed from universal_bot to footy_bot** (prime version for documentation). Same feature set: `/predict` (league → team → match → modal), 7-day window, per-match lock at kick-off; `/leaderboard` (per-league + overall, season + all-time); `/resetleaderboard` (admin + confirmation); `!score` via **core/score_lookup.js**; SQLite (predictions, results, points, points_log); 5pt exact / 2pt result / 1pt scorer. Env: `FOOTY_BOT_`*. |


### Shared core


| Version  | Date        | Changes                                                                                                                                                                                          |
| -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **v1.0** | 21 Feb 2026 | **core/team_aliases.js** (LEAGUES, LEAGUE_LABELS, TEAM_ALIASES); **core/score_lookup.js** (`!score` handler, 8 leagues); **core/result_checker.js** (auto result checker used by Blue Frontier). |


---

## Changelog

Full history: **[CHANGELOG.md](CHANGELOG.md)** (this folder). Workspace-wide entries: [CHANGELOG.md](../CHANGELOG.md) at Discord Bots root.

---

## Current status


| Component         | Status        | Notes                                                                                                                                                                                                                                                       |
| ----------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Blue Frontier** | Ready         | **Production (Railway, branch main):** volume `/data`, `DATA_DIR=/data`; Build/Start in **blue_frontier**. **Lab (Railway, branch lab):** second service **Blue-Frontier-LAB**, vars in **blue_frontier/lab/RAILWAY_VARIABLES_LAB.md**; deploy `./blue_frontier/lab/deploy-lab.sh`. Local `./lab-frontier.sh` is optional fallback. |
| **Footy Bot**     | Ready         | Run from `football-bots`: `cd footy_bot && npm install && npm start`. Wire `fetchScores(league)` to your API for real fixtures. Discord name: **footy_bot**.                                                                                                |
| **core**          | In use        | Shared by both bots; no standalone run.                                                                                                                                                                                                                     |
| **SportRadar**    | Stub          | Blue Frontier: set `SPORTRADAR_KEY` and uncomment fetch in `_fetchFinalScore` to enable auto results.                                                                                                                                                       |
| **Footy Bot API** | Stub          | Replace `fetchScores(league)` in `footy_bot/index.js` for live fixtures.                                                                                                                                                                                    |
| **Model / LLM**   | Claude Sonnet 4.6 | Session model for latest status update.                                                                                                                                                                                                                  |


Known issues and fixes: see [DEBUG.md](../DEBUG.md) at Discord Bots root.

---

## Next steps

1. **Blue Frontier Lab on Railway:** Create **Blue-Frontier-LAB** (branch `lab`, vars from [blue_frontier/lab/RAILWAY_VARIABLES_LAB.md](blue_frontier/lab/RAILWAY_VARIABLES_LAB.md)), then `./blue_frontier/lab/deploy-lab.sh`. Confirm DATPANDA `/fixtures` and log line `(lab)`.
2. **World Cup 2026:** Use WokeDyche only (TBF WC lab code removed).
3. **Production** remains `./deploy.sh` / **updatetbf** on **main** — do not point the production service at `lab`.
4. **Optional**
  - Enable SportRadar: add `SPORTRADAR_KEY` and uncomment the fetch in `blue_frontier/index.js` (`_fetchFinalScore`).
  - Wire Footy Bot fixtures: replace `fetchScores(league)` stub in `footy_bot/index.js` with your sports API.

---

## Handover / Downloads

- **Handover** (e.g. `Downloads/files`, `files (1)`, `files (2)`) has been **fully merged or superseded**. This repo is the source of truth.
- **Python** handover files (Universal Predictor / Footy Bot predecessor, `score_lookup.py`) are **not needed**; the JS version in **football-bots** (footy_bot) replaces them.
- See **HANDOVER_AUDIT.md**, **DOWNLOADS_CHECK.md**, and **FILES_TO_DOWNLOAD_FROM_CLAUDE.md** in this folder for details and cleanup notes.

