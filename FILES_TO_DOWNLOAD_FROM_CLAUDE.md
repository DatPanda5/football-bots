# Files to download from Claude (phone / other session)

**Project root:** `football-bots/`

Use this only if you are in another Claude chat (e.g. on your phone) and need to recover or sync something.

---

## You don’t need to download anything for this project

All code is already in **football-bots**:

- **Blue Frontier Committee** (Everton) — `blue_frontier/` (v3.0, SQLite, auto result checker, `!score`, full opponent squads).
- **Footy Bot** (Discord name: footy_bot) — `footy_bot/` (JavaScript: `/predict`, `/leaderboard`, `/resetleaderboard`, `!score`).
- **Shared core** — `core/` (score_lookup, team_aliases, result_checker).

The handover from Claude (Downloads/files, files (1), files (2), score_lookup.py) has been **merged or converted** into this repo. There is no missing “second bot” or missing core file.

---

## If you still use the Python handover folders

| File / folder | Purpose | Needed for football-bots? |
|---------------|--------|----------------------------|
| **files (2)** — Python Universal bot | 7 modules (bot, config, database, evaluator, leaderboard, predict, results) | ❌ No — use `footy_bot/` (JS) instead. |
| **score_lookup.py** | `!score` + aliases | ❌ No — use `core/score_lookup.js` and `core/team_aliases.js`. |
| **files** — Everton index.js, package.json | v3.0 handover | ❌ No — use `blue_frontier/`. |

Only ask Claude to re-export something if you need a **different** project or an **older** version; for the current two-bot setup, nothing is missing.

---

## After cloning or moving football-bots

1. **Install:** `cd blue_frontier && npm install` and `cd footy_bot && npm install`.
2. **Env:** Copy `blue_frontier/.env.example` and `footy_bot/.env.example` to `.env` in each folder and fill in tokens and IDs.
3. **Run:** From `football-bots`, run `npm run start:blue` or `npm run start:footy`, or run `node blue_frontier/index.js` / `node footy_bot/index.js` from this folder.

Never paste or download real `.env` or tokens from chat; use the `.env.example` files and fill values locally.
