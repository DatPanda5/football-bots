# Downloads check — handover vs football-bots

**Project root:** `football-bots/`  
**Handover locations:** `Downloads/files`, `Downloads/files (1)`, `Downloads/files (2)` (and `Downloads/score_lookup.py`)

---

## Current state (no download needed)

All code for both bots lives in **football-bots**:

- **Blue Frontier** — `blue_frontier/` (v3.0, SQLite, auto result checker, `!score`, full squads).
- **Footy Bot** (Discord name: footy_bot) — `footy_bot/` (JavaScript: `/predict`, `/leaderboard`, `/resetleaderboard`, `!score`).
- **Shared core** — `core/score_lookup.js`, `core/team_aliases.js`, `core/result_checker.js`.

The Python handover files in **files (1)** and **files (2)** have been **converted and merged** into this repo. You do **not** need to download or run anything from those folders for this project.

---

## What the handover folders contained (reference only)

| Location        | Contents | Still needed? |
|----------------|----------|----------------|
| **files**      | README, index.js (Everton v3.0), package.json | ❌ No — merged into `blue_frontier/`. |
| **files (1)**  | README, universal_predict.py only | ❌ No — Footy Bot is in JS in `footy_bot/`. |
| **files (2)**  | Full Universal Predictor in Python (7 modules) | ❌ No — JS version in `footy_bot/`. |
| **score_lookup.py** | `!score` + team aliases (Python) | ❌ No — replaced by `core/score_lookup.js` and `core/team_aliases.js`. |

---

## Cleanup (optional)

You can **archive or delete** the following from your machine without affecting football-bots:

- **Downloads/files** — entire folder (Everton v3.0 handover; now in `football-bots/blue_frontier`).
- **Downloads/files (1)** — entire folder (incomplete Python + README; superseded).
- **Downloads/files (2)** — entire folder (Python Universal bot; superseded by `football-bots/footy_bot`).
- **Downloads/score_lookup.py** — single file (logic in `core/score_lookup.js` and `core/team_aliases.js`).

Keep a backup if you want to refer to the original Python design; otherwise they are redundant.

---

## Summary

- **football-bots** is the single source of truth.
- No files need to be downloaded from Claude or from the handover folders to run or develop this project.
