# 🏆 Football Bots — Two-Bot Architecture

**Project root:** `football-bots/` (this folder)

Both bots are **JavaScript (Node.js)** + discord.js v14. No Python; no `requirements.txt` — use **`package.json`** and **`npm install`** in each bot folder (or at root if you use the root scripts below).

**Primary Everton bot:** **blue_frontier**. The standalone tbfbot folder is archived in **+Archive/tbfbot** at the Discord Bots root.

---

## Project structure

```
football-bots/
├── core/                        ← shared by both bots
│   ├── score_lookup.js         ← !score command (aliases + league search)
│   ├── team_aliases.js         ← LEAGUES, LEAGUE_LABELS, TEAM_ALIASES
│   └── result_checker.js       ← auto result checker (Everton: poll after kick-off, post results)
│
├── blue_frontier/               ← Everton bot (The Blue Frontier Committee)
│   ├── index.js                 ← entry point
│   ├── package.json
│   ├── .env.example
│   └── data/                    ← predictions.db (created on first run)
│
├── footy_bot/                   ← Footy Bot (Discord name: footy_bot)
│   ├── index.js                 ← entry point
│   ├── database.js              ← SQLite (predictions, results, points)
│   ├── evaluator.js             ← points logic
│   ├── package.json
│   └── data/                    ← predictions.db (created on first run)
│
└── README.md                    ← this file
```

---

## Blue Frontier Committee (Everton bot)

- **Run:** `cd blue_frontier && npm install && npm start`
- **Env:** Copy `blue_frontier/.env.example` to `blue_frontier/.env`. Set `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`; optional `MOD_ROLE_ID`, `RESULTS_CHANNEL_ID`, `SPORTRADAR_KEY`.
- **Commands:** `/fixtures`, `/predict`, `/myprediction`, `/listpredictions`, `/clearprediction`, `/final`, `!score [team]`.

---

## Footy Bot (Discord name: footy_bot)

- **Run:** `cd footy_bot && npm install && npm start`
- **Env:** Create `footy_bot/.env` (or use parent `.env`). Set:
  - `FOOTY_BOT_TOKEN` (or `DISCORD_TOKEN`)
  - `FOOTY_BOT_CLIENT_ID` (or `CLIENT_ID`)
  - `FOOTY_BOT_GUILD_ID` (or `GUILD_ID`)
  - `FOOTY_BOT_PREDICTIONS_CHANNEL_ID` (or `PREDICTIONS_CHANNEL_ID`) — where prediction confirmations are posted
- **Commands:** `/predict` (league → team → match → modal), `/leaderboard`, `/resetleaderboard` (admin), `!score [team]`.
- **Stub:** `fetchScores(league)` in `footy_bot/index.js` returns `[]`; replace with your sports API to show real fixtures.

---

## Running from this folder (football-bots)

From **football-bots** (this directory):

- **Everton bot:** `npm run start:blue` or `node blue_frontier/index.js`
- **Footy Bot:** `npm run start:footy` or `node footy_bot/index.js`

Run `npm install` in `blue_frontier/` and in `footy_bot/` before first run (each has its own `package.json`).

---

## Dependencies (no requirements.txt)

- **Node.js** (LTS recommended)
- Each bot has its own **package.json**; run **`npm install`** in `blue_frontier/` and in `footy_bot/` before first run.
- Optional: root **package.json** with scripts `"start:blue": "node blue_frontier/index.js"` and `"start:footy": "node footy_bot/index.js"` if you prefer one place to start from.
