# Blue Frontier Lab

Lab environment for testing the bot in the **DATPANDA BOT TESTING** Discord server, using a **separate Discord app** from production.

**Primary:** Railway service **Blue-Frontier-LAB**, deploys from the **`lab`** branch.  
**Local:** optional fallback via `lab-frontier.sh` (Mac stays off for normal testing).

## Convention (lab vs production)

**Everything lab-specific must live under `blue_frontier/lab/`** as long as it does not impact production. If a change would affect production (e.g. code or config that the Railway-deployed production bot uses), that file stays where it is — do not move or duplicate it into `lab/`. Examples: `deploy-lab.sh`, `.env.lab`, `.env.lab.example`, `.lab-pid`, `logs/` → in `lab/`. `index.js`, `package.json`, `seed-predictions.json`, `data/`, core requires → stay at `blue_frontier/` root.

---

## Railway (always-on lab)

Same pattern as WokeDyche-LAB: a **second Railway service** in the football-bots project, watching **`lab`**, with lab token and DATPANDA `GUILD_ID`. Production stays on **`main`** (`./deploy.sh` / Alfred **updatetbf**).

### One-time: create the service

1. [railway.app](https://railway.app) → the same project as production Blue Frontier.
2. **New service** → **GitHub repo** → `DatPanda5/football-bots`.
3. **Settings → Source:** branch **`lab`**. If `lab` does not exist yet, run `./blue_frontier/lab/deploy-lab.sh` first (creates and pushes it).
4. **Build / Start** — same as production:
   - Build: `cd blue_frontier && npm install`
   - Start: `cd blue_frontier && npm install && node index.js`
5. **Volumes:** add volume, mount **`/data`**.
6. **Variables:** copy from [RAILWAY_VARIABLES_LAB.md](RAILWAY_VARIABLES_LAB.md). Token comes from `lab/.env.lab` (`DISCORD_TOKEN` only — never commit it).
7. Redeploy. Logs should show `✅ Online as … (lab)`.

### Deploy updates to lab (does not push `main`)

From **football-bots** repo root:

```bash
./blue_frontier/lab/deploy-lab.sh "Your commit message"
```

The script commits staged lab-related source on `main` if needed, merges `main` into `lab`, and pushes **`origin/lab` only**.

**Alfred** (replace **tbflabpush** with this; lab stays online on Railway — no local restart):

```bash
"/Users/kevbui/Desktop/Discord Bots/football-bots/blue_frontier/lab/run-in-terminal.sh" deploy
```

Or Run Script `/bin/zsh`:

```bash
"/Users/kevbui/Desktop/Discord Bots/football-bots/blue_frontier/lab/deploy-lab.sh" "$1" 2>&1 \
&& echo "✅ Blue Frontier LAB deploy pushed (branch: lab)" \
|| echo "❌ Blue Frontier LAB deploy failed — check Alfred debugger/logs"
```

### Slash commands not showing?

1. Invite the **lab** bot with **`bot` + `applications.commands`** (URL in `.env.lab.example`).
2. Lab Railway service must use the **lab** token, not production.
3. Set `GUILD_ID=609194510660009995` on the lab service.
4. In Discord, pick the **lab** app in the `/` picker (not production).

**"Used disallowed intents":** lab app → Bot → **Message Content Intent** ON.

### Port production predictions into Railway lab

`port-production-to-lab.sh` still restores into the **local** SQLite file. For Railway lab:

1. Backup production (`railway ssh` on the **production** service → `node blue_frontier/backup-db.js`, or see [docs/DEPLOY.md](../docs/DEPLOY.md)).
2. On **Blue-Frontier-LAB**, set `RESTORE_DB_BASE64` to that backup, with `DATA_DIR=/data`.
3. Redeploy. Confirm `/listpredictions`, then **delete** `RESTORE_DB_BASE64`.

---

## Local fallback (optional)

PID and logs: `.lab-pid`, `logs/lab.log`. From repo root: `./lab-frontier.sh start|stop|restart`.

| Keyword (legacy) | Run Script |
|-------------|------------|
| **tbflabon**   | `run-in-terminal.sh` start |
| **tbflaboff**  | `run-in-terminal.sh` stop |
| **tbflabport** | `run-in-terminal.sh` port (local DB only) |

**Setup:** Copy `lab/.env.lab.example` to `lab/.env.lab`. The script loads **only** `lab/.env.lab` via `DOTENV_CONFIG_PATH`.
