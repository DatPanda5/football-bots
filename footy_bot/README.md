# Footy Bot

**Discord name:** `footy_bot`  
**Version:** 1.0 (prime) — renamed from universal_bot for documentation.

Multi-league football score predictor: `/predict`, `/leaderboard`, `/resetleaderboard`, `!score`. Uses **football-bots/core/** for score lookup and team aliases.

## Quick start

```bash
cd footy_bot && npm install && npm start
```

From **football-bots** root: `npm run start:footy` or `node footy_bot/index.js`.

## Env (.env)

Copy `.env.example` to `.env`. Set:

- `FOOTY_BOT_TOKEN` (or `DISCORD_TOKEN`)
- `FOOTY_BOT_CLIENT_ID` (or `CLIENT_ID`)
- `FOOTY_BOT_GUILD_ID` (or `GUILD_ID`)
- `FOOTY_BOT_PREDICTIONS_CHANNEL_ID` (or `PREDICTIONS_CHANNEL_ID`) — where prediction confirmations are posted

## Commands

| Command | Description |
|--------|-------------|
| `/predict` | Submit or update a score prediction (league → team → match → modal) |
| `/leaderboard` | View leaderboard (league + season/all-time) |
| `/resetleaderboard` | Admin: reset leaderboard (with confirmation) |
| `!score [team]` | Look up scores (via core/score_lookup) |

## Fixtures

`fetchScores(league)` in `index.js` is a stub returning `[]`. Replace it with your sports API to show real upcoming fixtures.

See **football-bots/README.md** for full project layout and Blue Frontier (Everton) bot.
