# Blue Frontier Lab Railway Variables

Use this file as the source of truth for the **Blue-Frontier-LAB** Railway service (separate from production).

Lab Discord app (DATPANDA BOT TESTING): **CLIENT_ID** `1479514028450775082`.  
Do **not** copy production `DISCORD_TOKEN` or `BLUE_FRONTIER_GUILD_ID` onto this service.

## Required variables

- `DISCORD_TOKEN` = **lab** bot token (from Developer Portal for the lab app; same value as `blue_frontier/lab/.env.lab`)
- `CLIENT_ID` = `1479514028450775082`
- `GUILD_ID` = `609194510660009995` (DATPANDA BOT TESTING — guild slash-command sync)
- `BLUE_FRONTIER_ENV` = `lab`
- `DATA_DIR` = `/data` (after attaching a volume at `/data`)

## Recommended variables

- `MOD_ROLE_ID` = MOD role on DATPANDA BOT TESTING (so `/final` works in lab)

## Optional variables

- `PREDICTIONS_CHANNEL_ID` / `RESULTS_CHANNEL_ID` — lab channels only, if you want kickoff-lock posts / auto result checker. Leave unset to use `/final` only (same as local lab).

## Variables to avoid on the lab service

- `BLUE_FRONTIER_GUILD_ID` — production guild; omit so the lab app never registers commands there.
- Production `DISCORD_TOKEN`
- `ALLOWED_PREDICTION_CHANNEL_IDS` — omit so lab can test in any DATPANDA channel.

## Service settings (match production, different branch)

| Setting | Value |
|---------|--------|
| GitHub repo | `DatPanda5/football-bots` |
| Branch | **`lab`** (not `main`) |
| Root Directory | repo root (empty / default) |
| Build Command | `cd blue_frontier && npm install` |
| Start Command | `cd blue_frontier && npm install && node index.js` |
| Volume | mount path **`/data`** |

## After changing variables

Redeploy the lab service and in DATPANDA confirm:

- Deploy log: `✅ Online as … (lab)`
- `/fixtures`, `/predict`, `/listpredictions`, `/final`
