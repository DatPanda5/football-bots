# Deploying Blue Frontier with persistent predictions (Railway)

Use this flow **once** so your existing 13 predictions are kept when you switch to a persistent volume.

---

## 1. Backup the current DB (before changing anything)

You need a copy of the DB from the **currently running** container. Railway's dashboard (Variables, Settings, etc.) does **not** have a "Run command" or "Execute" button. You do this from your **own machine** using the **Railway CLI** and **SSH into the live container**.

### Step 1a: Install and link the CLI

1. Install the CLI: **https://docs.railway.app/develop/cli** (e.g. `npm i -g @railway/cli`).
2. In a terminal, go to your project folder (e.g. `football-bots` or `blue_frontier`).
3. Run **`railway link`** and choose your project and the **Blue Frontier** service (the one in your Railway URL). That links this folder to that service.

### Step 1b: Run the backup inside the container

The DB lives **inside the deployed container**. The container's shell often breaks inline `node -e "..."` commands, so use the **script** or **interactive** method below.

**Option 1 — Script (recommended)**  
There is a **`backup-db.js`** at the **repo root** (`football-bots/backup-db.js`) that finds the DB and prints base64.

1. **Deploy once** so this file is in the container (push and let Railway deploy).
2. From your machine, in the **`football-bots`** folder, run:
   ```bash
   railway ssh -- node backup-db.js > backup_b64.txt
   ```
3. Open `backup_b64.txt`. It should be one long base64 line. If you see `No DB found`, use Option 2.

**Option 2 — Interactive (if the script path is wrong)**  
1. Run **`railway ssh`** to get a shell in the container.
2. Run **`pwd`** and **`ls -la`**, then **`ls data/`** or **`ls blue_frontier/data/`** to find where `predictions.db` is.
3. From the directory that contains that `data/` folder, run:  
   **`node -e "const fs=require('fs');const f='./data/predictions.db';if(fs.existsSync(f))process.stdout.write(fs.readFileSync(f).toString('base64'));"`**
4. **Copy the entire base64 output** (one long line) and paste it into a local file named `backup_b64.txt`.
5. Type **`exit`**.

You should end up with one long base64 line in `backup_b64.txt`. Keep it for step 4 (restore).

---

## 2. Add a persistent volume in Railway

1. In Railway: **Your service** → **Variables** tab (or **Settings**).
2. Open **Volumes** (or **Storage**).
3. Click **Add volume** (or **New volume**).
4. Set **Mount path** to exactly: **`/data`**
5. Save. Railway will attach this path to the container so anything written under `/data` survives redeploys.

---

## 3. Point the app at the volume

1. In the same service, go to **Variables**.
2. Add a variable:
   - **Name:** `DATA_DIR`
   - **Value:** `/data`
3. Save. The app will now use `/data/predictions.db` (on the volume) instead of `./data/predictions.db`.

---

## 4. Restore the backup on first deploy

1. Still in **Variables**, add:
   - **Name:** `RESTORE_DB_BASE64`
   - **Value:** paste the **entire** base64 string from step 1 (the contents of `backup_b64.txt`). No quotes, no spaces; just the long base64 line.
2. Save and **redeploy** (e.g. trigger a new deploy or push a commit).

On first start with the new volume, the app will see an empty `/data`, see `RESTORE_DB_BASE64`, and write the backup to `/data/predictions.db`. Your 13 predictions will be there.

---

## 5. Remove the restore variable (after confirming)

1. After the deploy has run and the bot is up, run `/listpredictions` (or check the DB) and confirm the 13 predictions are there.
2. In Railway **Variables**, **delete** `RESTORE_DB_BASE64`.
3. Redeploy or leave as is. Future restarts will not overwrite the DB; they will just use the existing `/data/predictions.db` on the volume.

From now on, all new predictions are stored on the volume and will survive redeploys.

---

## Summary

| Step | What you do |
|------|-------------|
| 1 | Backup current DB to base64 (dashboard or CLI) and save to a file. |
| 2 | Add a volume with mount path **`/data`**. |
| 3 | Set **`DATA_DIR=/data`**. |
| 4 | Set **`RESTORE_DB_BASE64`** to the backup string and redeploy. |
| 5 | Confirm predictions, then remove **`RESTORE_DB_BASE64`**. |

If your app runs from the **monorepo root** (e.g. root is `football-bots` and you run `node blue_frontier/index.js`), the backup command must use the path where the app actually writes the DB. With no `DATA_DIR`, that is `./data` relative to the process (often `blue_frontier/data` if cwd is `blue_frontier`, or `data` if cwd is repo root). Adjust the path in the backup command if needed.
