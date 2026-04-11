# Blue Frontier Lab

Local-only environment for testing the bot in the **DATPANDA BOT TESTING** Discord server. Production runs on Railway (The Blue Frontier server).

## Convention (lab vs production)

**Everything lab-specific must live under `blue_frontier/lab/`** as long as it does not impact production. If a change would affect production (e.g. code or config that the Railway-deployed bot uses), that file stays where it is — do not move or duplicate it into `lab/`. Examples: `lab-frontier.sh`, `.env.lab`, `.env.lab.example`, `.lab-pid`, `logs/` → in `lab/`. `index.js`, `package.json`, `seed-predictions.json`, `data/`, core requires → stay at `blue_frontier/` root.

---

**Script:** `lab-frontier.sh` — start / stop / restart the bot locally. PID and logs live in this folder (`.lab-pid`, `logs/lab.log`).

**From repo root:** Run `./lab-frontier.sh start|stop|restart` (or use Alfred **tbflabon**, **tbflabpush**, **tbflaboff**). The root `lab-frontier.sh` is a wrapper that calls this script.

**Alfred + Terminal (see output in a window):** Use **Run Script** `/bin/zsh` so each keyword opens Terminal and runs the command there (with ✅ 🛑 emojis). From repo root:

| Keyword      | Run Script |
|-------------|------------|
| **tbflabon**   | `"/Users/kevbui/Desktop/Discord Bots/football-bots/blue_frontier/lab/run-in-terminal.sh" start` |
| **tbflabpush** | `"/Users/kevbui/Desktop/Discord Bots/football-bots/blue_frontier/lab/run-in-terminal.sh" restart` |
| **tbflaboff**  | `"/Users/kevbui/Desktop/Discord Bots/football-bots/blue_frontier/lab/run-in-terminal.sh" stop` |
| **tbflabport** | `"/Users/kevbui/Desktop/Discord Bots/football-bots/blue_frontier/lab/run-in-terminal.sh" port` |

- **tbflabon** starts the lab and then tails the log in that window (real-time output); Ctrl+C stops only the tail, not the lab.
- **tbflabport** shows each step (🛑 stop → 📥 fetch → ✅ DB synced → 🚀 start) and confirmation when done.

**Setup:** Use a separate Discord app for the lab. Copy `lab/.env.lab.example` to `lab/.env.lab` (in this folder) and add the lab bot’s token, CLIENT_ID, and GUILD_ID. The lab script loads **only** `lab/.env.lab` when starting, so production credentials in `.env` are never used by the lab. **Slash commands:** Invite the lab bot with a URL that includes the `applications.commands` scope (e.g. `scope=bot%20applications.commands`). If `/commands` don’t appear, remove the bot from the server and re-invite using the link in `.env.lab.example`.

**"Used disallowed intents":** The bot needs **Message Content Intent** enabled. In [Discord Developer Portal](https://discord.com/developers/applications) → your **lab** app → **Bot** → scroll to **Privileged Gateway Intents** → turn **Message Content Intent** **ON**. Save, then restart the lab (`./lab-frontier.sh restart`).

**Port production predictions into the lab:** Run from repo root: `./blue_frontier/lab/port-production-to-lab.sh` (stops lab → fetches production DB → restores → starts lab). Or use Alfred **tbflabport**. If you see **"No DB at /data/predictions.db"**: `railway run` doesn't use the same volume as your deployed bot. Get the backup from the **running** service (Railway dashboard → your service → run a shell/one-off, then `node blue_frontier/backup-db.js`), copy the base64 into `lab/production-backup.b64`, then run the restore step and start the lab manually (see the script's error message for exact steps). `production-backup.b64` is gitignored.

## World Cup test data (lab only)

- Preloaded source for the 2026 group stage (ET-first for TBF lab): `blue_frontier/lab/data/world-cup-2026-group-stage-et.csv`
- Time fields:
  - `kickoff_et` (display value from source)
  - `kickoff_et_iso` (ISO timestamp with `America/New_York` offset)
- Team list updated to the final 2026 group stage after playoffs (e.g. Czechia, Bosnia, Türkiye, Sweden, Iraq, DR Congo); `source_note` column in CSV marks the refresh batch.
