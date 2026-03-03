# Seeding the 13 predictions (no backup needed)

**`seed-predictions.json` is filled** with 13 predictions for Everton vs Burnley (fix03). Follow the steps below to add a persistent volume, set `DATA_DIR`, and deploy so the app seeds them on first run.

---

## Step 1: Add a persistent volume (Railway)

This gives the app a folder that survives redeploys so predictions aren’t lost.

1. Open **Railway** in your browser and go to your **project**.
2. Click your **Blue Frontier** service (the one that runs the bot).
3. In the service view, open the **Variables** tab (or use the **Command Palette**: **⌘K** / **Ctrl+K** and search for “volume”).
4. **Add a volume:**
   - Look for a **“Volumes”** or **“Storage”** section (often in the same service panel, or under a **“+”** / **“Add”** menu).
   - Click **“Add volume”** or **“New volume”**.
   - When asked for **Mount path**, enter exactly: **`/data`** (no spaces, no trailing slash).
   - Confirm / Save. Railway will attach this path to the container so anything written under `/data` is kept across deploys.

**Can’t find Volumes?** Try: service **Settings** (gear icon) → look for **Volumes** or **Storage**; or press **⌘K** (Mac) / **Ctrl+K** (Windows), type **volume**, and choose the option to add a volume to the service.

---

## Step 2: Set DATA_DIR so the app uses the volume

The app needs to know to use `/data` instead of the default folder.

1. Stay in your **Blue Frontier** service in Railway.
2. Go to the **Variables** tab (list of environment variables).
3. Click **“New variable”** or **“Add variable”**.
4. Set:
   - **Variable name:** `DATA_DIR`
   - **Value:** `/data`
5. Save. The bot will now store `predictions.db` in `/data` (on the volume).

---

## Step 3: (Optional) Use real Discord User IDs in `seed-predictions.json`

The file is already filled with 13 entries. **`/listpredictions`** will show all of them after deploy.

For **`/myprediction`** to show “Your predictions” for each person, **`userId`** in the seed file must be that person’s **Discord User ID** (a long number), not their username. Right now some rows use usernames (e.g. `k_bui`, `lexel_prix`).

- **To fix later:** In Discord, enable **Developer Mode** (Settings → App Settings → Advanced), then right‑click the user → **Copy User ID**. Replace the `userId` value in that row with the copied ID (e.g. `"123456789012345678"`). Redeploy or re-seed only if you clear the DB.
- **To leave as-is:** All 13 will still appear in `/listpredictions`; `/myprediction` will only match users whose `userId` in the file is their real Discord ID.

---

## Step 4: Deploy

1. **Commit and push** your code (including the filled-in `seed-predictions.json`), **or** in Railway click **“Deploy”** / **“Redeploy”** to use the latest commit.
2. Wait for the deploy to finish. On **first start** with an **empty** predictions table, the app will load `seed-predictions.json` and insert all valid rows once. After that, the 13 predictions are in the DB and new ones are stored on the volume.

No backup, no `railway ssh`, no base64.

---

## Loading an updated seed file (after first deploy)

You already deployed and the DB was seeded. You’ve since updated **`seed-predictions.json`** (e.g. to 14 or 15 entries) and want that full list in the DB.

### 1. Commit and push the updated seed file

Get the new `seed-predictions.json` into the branch Railway deploys from (usually `main`) so the next deploy uses it:

- **Save** the file in your editor (e.g. Cursor).
- In a terminal, from your project root (e.g. `football-bots` or the repo that contains `blue_frontier`):
  ```bash
  git add blue_frontier/seed-predictions.json
  git commit -m "Update seed-predictions.json (14 entries)"
  git push
  ```
- If Railway is connected to GitHub/GitLab, it will deploy from the branch you pushed to (often `main`). Wait for that deploy to finish, or trigger a redeploy in the Railway dashboard so the new code (including the updated seed file) is what runs.

### 2. Force the app to re-run the seed

- In Railway → **football-bots** service → **Variables** → add:
  - **Name:** `SEED_PREDICTIONS`
  - **Value:** `1`
- Save. Railway will redeploy (or click **Deploy** / **Redeploy**).

**What happens when the app starts:** The bot reads the `SEED_PREDICTIONS` variable. Because it’s set to `1`, the bot loads **`seed-predictions.json`** and writes every row into the database. Rows that already exist (same user + fixture) are **updated**; rows that don’t exist yet (e.g. nweins00) are **inserted**. So after this deploy, the DB will match the 14 entries in your seed file. You only need `SEED_PREDICTIONS=1` for this one deploy; then remove it.

### 3. After deploy

- **Remove** the `SEED_PREDICTIONS` variable in Railway so the next restart doesn’t re-seed every time.

---

## Still seeing "No predictions yet"?

1. **What match does `/listpredictions` show?** If it shows **Arsenal** (or any match other than Everton vs Burnley), the bot was showing the *next* fixture by date; your seeded predictions are for **Burnley (fix03)**. The code now falls back: if the next fixture has zero predictions, it shows the fixture that *has* predictions (e.g. Burnley). Deploy the latest code and try again.
2. **Did the seed run?** In Railway → **Deployments** → latest → **Logs**, look for: `[DB] Seeded 14 prediction(s) from seed-predictions.json`. If it’s missing, the seed didn’t run (e.g. `SEED_PREDICTIONS` was not `1` when that deploy started, or `seed-predictions.json` wasn’t in the container).
3. **Is the DB on the volume?** In **Variables**, confirm **`DATA_DIR`** = **`/data`**. Without it, the app uses a non-persistent path and redeploys can start with an empty DB.
4. **Re-run the seed:** Set **`SEED_PREDICTIONS`** = **`1`** in Variables **before** (or when) you trigger the deploy, so the variable is present when the new container starts. Save, wait for the deploy to finish, then check the logs (see below). After you see the seed message, remove the variable.

**What the logs will show** (after the latest code is deployed):
- **`[DB] Seeded 14 prediction(s) from seed-predictions.json`** — seed ran; predictions are in the DB.
- **`[DB] Seed skipped: seed-predictions.json not found at /app/...`** — the seed file isn’t in the container at that path (check your repo/deploy structure so `blue_frontier/seed-predictions.json` is included in the build).
- **`[DB] Seed skipped: table has N row(s) and SEED_PREDICTIONS is not set`** — the table already had rows and the env var wasn’t set when this deploy started. Set **`SEED_PREDICTIONS`** = **`1`**, save (to trigger a new deploy), then check the logs again.

---

## Repeating the seed/merge later

Whenever you add or change entries in **`seed-predictions.json`** and want them in the live DB:

1. **Edit and save** `blue_frontier/seed-predictions.json`.
2. **Commit and push** (e.g. `git add blue_frontier/seed-predictions.json`, `git commit -m "Update seed"`, `git push`). Wait for deploy.
3. In Railway → **Variables** → set **`SEED_PREDICTIONS`** = **`1`** → Save (redeploy).
4. After deploy: **Remove** `SEED_PREDICTIONS`, then run **`/listpredictions`** to confirm.
