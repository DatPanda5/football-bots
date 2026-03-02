# 🔵 The Blue Frontier Committee
### Everton Discord Bot

**This is the new primary version of the bot.** The standalone tbfbot is archived in `+Archive/tbfbot`; deploy from **football-bots/blue_frontier** (this folder).

**Bot avatar (Discord):** Use **`tbf_committee.png`** in this folder when setting the application’s avatar in the [Discord Developer Portal](https://discord.com/developers/applications) → your app → Bot → Avatar.

---

## Setup

```bash
npm install
cp .env.example .env   # fill in your TOKEN, CLIENT_ID, GUILD_ID
npm start
```

> **Dev mode** (auto-restarts on save): `npm run dev`

---

## Local run and test (Mac terminal + test Discord server)

Run the bot on your Mac and test it in your test server **before** deploying to Railway.

### Step 1: One-time setup

1. **Terminal:** go to the bot folder and install dependencies.
   ```bash
   cd "/Users/kevbui/Desktop/Discord Bots/football-bots/blue_frontier"
   npm install
   ```
2. **Copy env file** and add your credentials:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set:
   - `DISCORD_TOKEN` — from [Discord Developer Portal](https://discord.com/developers/applications) → your app → Bot → Reset Token / Copy.
   - `CLIENT_ID` — same app → OAuth2 → Application ID.
   - `GUILD_ID` — **your test server ID:** `609194510660009995`.
   - Do **not** set `ALLOWED_PREDICTION_CHANNEL_IDS` (so you can test in any channel).

### Step 2: Invite the bot to your test server

1. In the Developer Portal: your application → **OAuth2** → **URL Generator**.
2. Scopes: **bot**. Permissions: **Send Messages**, **Embed Links**, **Read Message History**, **Read Messages/View Channels**, **Use Slash Commands**.
3. Copy the URL, open it in a browser, and select your **test server** (the one with ID `609194510660009995`). Authorize.

### Step 3: Start the bot in your terminal

From the same folder:

```bash
cd "/Users/kevbui/Desktop/Discord Bots/football-bots/blue_frontier"
npm start
```

You should see something like: `[The Blue Frontier Committee] ✅ Slash commands registered.` and `[The Blue Frontier Committee] ✅ Online as YourBot#1234`. Leave this terminal running.

### Step 4: Test in Discord (test server)

In any channel where the bot can read messages:

| What to do | What to expect |
|------------|----------------|
| Type `/fixtures` | Bot shows the next 5 Everton fixtures. |
| Type `/predict` | Bot shows a menu; pick a match, enter Everton and opponent score (and optional scorers). |
| Type `/myprediction` | Bot lists your predictions (or “You haven’t made any…”). |
| Type `/listpredictions` | Bot lists everyone’s predictions for the current/next fixture. |
| Type `/clearprediction` | Choose a fixture to remove your prediction. |
| Type `!score Everton` | Bot replies with match info (or “No match found” if no fixture). |

**Optional:** If you set `MOD_ROLE_ID` in `.env` and have that role, try `/final` for a fixture that has already “kicked off” in the code.

When you’re done testing, stop the bot with **Ctrl+C** in the terminal.

### Step 5: Next

Once everything works locally, follow **Deploy (GitHub + Railway)** below to put the bot online on Railway and (later) install it in the Blue Frontier server.

---

## Deploy (GitHub + Railway)

### 1. Push to GitHub

```bash
cd "/Users/kevbui/Desktop/Discord Bots/football-bots"
git init
git add .
git commit -m "Initial commit: Blue Frontier (primary Everton bot) v3.0"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

> Create the repo first: [github.com/new](https://github.com/new) → name it **football-bots** or **blue-frontier-bot** — replace `YOUR_USERNAME` and `YOUR_REPO_NAME` in the URL above. Leave “Add a README” unchecked if you already have one.

### 2. Deploy on Railway

1. Go to [railway.app](https://railway.app) and sign in (GitHub).
2. **New Project** → **Deploy from GitHub repo** → choose your football-bots repo.
3. In the service **Settings**:
   - **Root Directory:** leave default (repo root).
   - **Build Command:** `cd blue_frontier && npm install`
   - **Start Command:** `cd blue_frontier && npm install && node index.js`  
     _(Installs deps at startup so `blue_frontier/node_modules` exists in the container.)_
4. **Variables:** add the same keys as in `.env`:
   - **Required:** `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID` (your **test server** ID, e.g. `609194510660009995`). Commands are registered **globally** and also **per-guild** for:
     - The test server (`GUILD_ID`) and
     - The Blue Frontier server (`BLUE_FRONTIER_GUILD_ID`, see below),
     so new commands (like `/help`) appear almost instantly in those servers.
   - **Optional:** `MOD_ROLE_ID` (e.g. test server), `BLUE_FRONTIER_MOD_ROLE_ID` (MOD role in The Blue Frontier server, e.g. `1306013527961501812`), `RESULTS_CHANNEL_ID`, `PREDICTIONS_CHANNEL_ID`, `SPORTRADAR_KEY`. To restrict **prediction commands** (e.g. `/predict`, `/final`) to the score-predictions channel **only in The Blue Frontier server** (test server stays unrestricted), set `BLUE_FRONTIER_GUILD_ID` to that server’s ID and `ALLOWED_PREDICTION_CHANNEL_IDS=1306046468846522378` (or add more channel IDs comma-separated).
5. Redeploy after adding variables. The bot will stay online and reconnect if Discord drops.

### 3. Ongoing deploys

From the **football-bots** repo root, run `./deploy.sh` or `./deploy.sh "Your commit message"`. Push to GitHub and Railway auto-deploys in ~30 seconds.

### 4. After deploy — Test server + The Blue Frontier

- **Slash commands are global:** they appear in every server the bot has been invited to. No need to change `GUILD_ID` when you add the bot to another server.
- **Keep testing on your test server:** leave `GUILD_ID=609194510660009995` (or your test server ID) on Railway. Push changes → Railway redeploys → test in the test server first. When everything looks good, the same bot is already live in The Blue Frontier server.
- **Add the bot to The Blue Frontier:** use the [invite URL](#invite-bot-to-another-server) and select The Blue Frontier server (you need “Manage Server” there). The same bot instance serves both servers; commands work in both.

---

## Invite bot to another server

Use this OAuth2 URL to add the bot to a different Discord server:

**https://discord.com/oauth2/authorize?client_id=1473332827708850308&permissions=2147871744&integration_type=0&scope=bot**

(You must have “Manage Server” on the target server.)

---

## Commands

| Command | Description | Visible to? |
|---|---|---|
| `/fixtures` | Show the next 5 upcoming Everton matches | Everyone |
| `/predict` | Submit a score prediction (rolling next-5 window) | Everyone |
| `/listpredictions` | List everyone's predictions for the current/next fixture | Everyone (MODs see extra) |
| `/myprediction` | View your own predictions | You only |
| `/clearprediction` | Delete one of your predictions | You only |
| `/final` | MOD only: enter final score + optional scorers; awards points | MODs |
| `/leaderboard` | View prediction leaderboard (current season or all-time) | Everyone |
| `/resetleaderboard` | MOD only: reset **current season** or **all-time** points (all-time asks for confirm) | MODs |
| `/help` | Show all Blue Frontier Committee commands and how they work (ephemeral, only visible to you) | You only |

---

## Points (same as footy_bot)

- **5 pts** — exact score
- **2 pts** — correct result (win/draw/loss)
- **1 pt** — per correct goal scorer

Points are awarded when a MOD uses `/final` or when the auto result checker posts. Use `/leaderboard` for **current season** or **all-time** standings.

---

## How the rolling fixture window works

All 10 remaining Premier League fixtures are stored in `ALL_FIXTURES` with a
`kickoffUTC` timestamp. Every time `/predict` or `/fixtures` is called,
`getUpcomingFixtures()` runs live:

```
filter → kickoff is still in the future
sort   → ascending by date
slice  → first 5 only
```

This means once a match kicks off, it automatically falls out of the prediction
window — no manual updates needed until the end of the season.

---

## All remaining fixtures (2025-26)

| # | Date | Match |
|---|---|---|
| 1 | ~~Mon 15 Feb~~ (played) | Everton vs Manchester United |
| 2 | ~~Sat 18 Feb~~ (played) | Newcastle United vs Everton |
| 3 | Tue 03 Mar 19:30 | **Everton vs Burnley** ← next |
| 4 | Sun 15 Mar 14:00 | Arsenal vs Everton |
| 5 | Sat 21 Mar 17:30 | Everton vs Chelsea |
| 6 | Sat 11 Apr 14:00 | Brentford vs Everton |
| 7 | Sat 18 Apr 14:00 | Everton vs Liverpool |
| 8 | Sat 25 Apr 14:00 | West Ham United vs Everton |
| 9 | Sat 02 May 14:00 | Everton vs Manchester City |
| 10 | Sun 09 May 14:00 | Crystal Palace vs Everton |

---

## Notes

- **Predictions are stored in SQLite** (`blue_frontier/data/predictions.db`) and persist across restarts and Railway redeploys.
- Each member can have **one prediction per fixture**. Re-submitting overwrites.
- Optional **ALLOWED_PREDICTION_CHANNEL_IDS** (see `.env.example`): when set, score-prediction commands only work in those channels (e.g. on the Blue Frontier server).
- The bot is structured so additional feature modules can easily be added — this is the predictions module of The Blue Frontier Committee.

---

COYB! 🔵
