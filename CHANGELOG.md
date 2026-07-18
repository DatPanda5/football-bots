# Changelog — Football Bots

Reverse chronological (newest first). Entries may be prefixed with `[blue_frontier]`, `[footy_bot]`, or `[core]` where relevant. **Version source of truth:** each component’s `package.json` (semver MAJOR.MINOR.PATCH). Workspace-wide changelog: [CHANGELOG.md](../CHANGELOG.md) at Discord Bots root.

---

## 18 Jul 2026

- **[blue_frontier]** — Updated Dundee opponent squad for 2026–27 (pre-season friendly).
- **[blue_frontier]** — `/predict` goal scorers placeholder no longer includes minute examples (e.g. `71'`).

## 13 Jul 2026

- **[blue_frontier]** — Added Hayden Hackney (#30, DM/CM) to the 2026–27 Everton squad.

## 19 Jun 2026

- **[blue_frontier] v3.5.0** — **2026–27 fixture schedule:** `ALL_FIXTURES` replaced with 5 pre-season friendlies (`pre01`–`pre05`) plus 38 Premier League matches (`fix01`–`fix38`) from evertonfc.com. Opponent squads added for Dundee, Bolton, Stoke, VfB Stuttgart, Ipswich, Hull, and Coventry. Reference docs **26-27fixtures.md** and **squad.md**; `npm run sync-docs` regenerates them from `index.js`. `seed-predictions.json` cleared for new season.

## 28 May 2026

- **[blue_frontier]** — Removed World Cup 2026 lab predictor (`/wc-fixtures`, `/wc-final`), WC schedule CSV, and `TBF_WC_PREDICTOR` wiring from `index.js`. World Cup features remain in WokeDyche only.

## 17 Apr 2026

- **[blue_frontier] v3.4.0** — **Merseyside Derby bonus predictors:** Two 1pt bonus questions added to the `/predict` modal for `fix07` (Everton vs Liverpool) only — 🟨 yellow cards and 🟥 red cards. New columns `bonusYellowCards`/`bonusRedCards` on `predictions` and `yellowCards`/`redCards` on `fixture_results` (auto-migrated on startup). `/final` gains optional `yellow_cards` and `red_cards` integer options; scoring awards 1pt each for an exact match. All display embeds updated: prediction confirmation, `/listpredictions`, and the final result embed show bonus predictions and who got each right.

## 26 Mar 2026

- **[blue_frontier lab]** — Preloaded 2026 World Cup group-stage test schedule in ET at `blue_frontier/lab/data/world-cup-2026-group-stage-et.csv` (72 fixtures, stable `match_id` keys, UEFA playoff placeholders retained for later winner updates).
- **[blue_frontier lab]** — Added lab runbook note in `blue_frontier/lab/README.md` documenting the World Cup test dataset path and ET timestamp fields (`kickoff_et`, `kickoff_et_iso`).

## 16 Mar 2026

- **[blue_frontier] v3.3.1** — `/final` UX: fixture dropdown now shows only the most recent played match plus all future fixtures; "played" status comes from either a stored `/final` result or 48 hours having passed since kickoff. Labels keep consistent "played" wording. 
- **[blue_frontier lab]** — Updated lab MOD role ID in `blue_frontier/lab/.env.lab` so lab permissions match production expectations for `/final` and other MOD-only commands.

## 06 Mar 2026

- **[blue_frontier]** — **Scorer matching:** predicted scorers match by name/alias even with extra words (e.g. "Branthwaite at the death" counts as Branthwaite). **Aliases:** Ndiaye, Skiliman/Skilliman Ndiaye → Iliman Ndiaye; BIG MICK, Keggers, Keano → Michael Keane. Deploy pipeline check log line removed (gone on next deploy).
- **[blue_frontier] v3.3.1** — **GUILD_ID** optional: require at least one of GUILD_ID or BLUE_FRONTIER_GUILD_ID (production can omit GUILD_ID; fixes 50001 when production pointed at lab server). **[predict]** logs: username before userId; logPredictError includes username. **Semantic versioning:** package.json = source of truth (MAJOR.MINOR.PATCH); version history and CHANGELOG kept in sync.
- **[blue_frontier lab]** — Lab env: **.env.lab** in **blue_frontier/lab/** (separate from production); script loads via `DOTENV_CONFIG_PATH`. **Alfred + Terminal:** **run-in-terminal.sh** so tbflabon/tbflabpush/tbflaboff/tbflabport open a Terminal window with output (emojis ✅ 🛑 🔄 📥); always new window so output visible. **tbflabport:** port production DB to lab (stop → fetch → restore → start); PATH/nvm for Railway CLI; when "No DB at /data" (railway run has no volume), script shows manual backup steps from Railway running service; lab README updated. **Lab log tail:** timestamps `[YYYY-MM-DD HH:MM:SS]` on each line. **Lab-only:** suppress "No RESULTS_CHANNEL_ID/PREDICTIONS_CHANNEL_ID" warning when `DOTENV_CONFIG_PATH` set. **restore-from-production.js** in lab/; **port-production-to-lab.sh**; **.env.lab.example** with public IDs + Message Content Intent note.

---

## 04 Mar 2026

- **[workspace]** — Changelog split: **CHANGELOG.md** (this file) holds full football-bots history; PROJECT_STATUS_SUMMARY links here. Version policy added (semver; package.json = source of truth). Blue Frontier **package.json** and **package-lock.json** set to **3.3.0** to match doc and DEBUG (D002 fixed in v3.2).

## 03 Mar 2026

- **[blue_frontier] v3.3** — One prediction per match; overwrite warning + confirm. Kickoff lock autopost in score-predictions channel + catch-up; **fixture_results** + MOD view stored result via **/final** (optional everton/opponent). **/listpredictions:** view "Last 2 completed matches" + optional fixture pick. SEED.md cleanup. Deploy via Alfred **updatetbf** when Railway is back; then check `/listpredictions` and `/final`.
- **[blue_frontier] v3.2** — **/final:** deferReply + editReply (fix "application did not respond" — D002 fixed); "At least one correct goal scorer" field; removed full predicted-scorers list. **Scorer points:** _matchedScorers aligned with same normalization/set logic as display (leaderboard consistent).
- **[blue_frontier]** — Lab files moved to **blue_frontier/lab/** (lab-frontier.sh, README; root wrapper kept for Alfred). **Blue Frontier Lab** (local): **lab-frontier.sh** (start/stop/restart), Alfred **tbflabon** / **tbflabpush** / **tbflaboff**; Environments section in README; regression checklist; deploy.sh comment (production only). Railway persistent volume (`DATA_DIR=/data`); seed from **seed-predictions.json**; scorer aliases; **SEED.md**, **DEPLOY.md**; backup-db.js.
- **[blue_frontier] v3.1** — Persistent volume: `DATA_DIR` env (e.g. `/data` on Railway); seed from **seed-predictions.json** (empty table or `SEED_PREDICTIONS=1`); scorer aliases (JOB→Jake O'Brien, Rohl→Merlin Röhl) + diacritic normalization; `/listpredictions` shows next fixture, fallback to fixture with most predictions; mod channels (mod-chat, mod-bot-logs); DB row normalization; **SEED.md**, **DEPLOY.md**, backup-db.js.

## 02 Mar 2026

- **[blue_frontier]** — `/help` command (ephemeral); slash commands registered globally **and** per-guild for test + The Blue Frontier (instant visibility); `/help` crash fix (40060 already-acknowledged); `/predict` UX: clearer description, subtitle and dropdown placeholder. Alfred workflow **updatetbf**. Docs: README + PROJECT_STATUS updated.

## 21 Feb 2026

- **[footy_bot]** — Renamed universal_bot to **footy_bot** (prime v1.0). Same feature set: `/predict`, `/leaderboard`, `/resetleaderboard`, `!score` via core; SQLite; 5pt exact / 2pt result / 1pt scorer. Env: `FOOTY_BOT_*`.
- **[blue_frontier] v3.0** — SQLite persistence (`better-sqlite3`, `data/predictions.db`); auto result checker (polls 1hr 50min after kick-off, 5min retries, `/final` as MOD override); `!score` across 8 leagues with team aliases; `GuildMessages` + `MessageContent` intents; result checker in **core/result_checker.js**.
- **[workspace]** — Reorganized into football-bots/ (core, blue_frontier, footy_bot). Primary Everton bot: **blue_frontier**; tbfbot archived in +Archive.
