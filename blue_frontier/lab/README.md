# Blue Frontier Lab

Local-only environment for testing the bot in the **DATPANDA BOT TESTING** Discord server. Production runs on Railway (The Blue Frontier server).

**Script:** `lab-frontier.sh` — start / stop / restart the bot locally. PID and logs live in this folder (`.lab-pid`, `logs/lab.log`).

**From repo root:** Run `./lab-frontier.sh start|stop|restart` (or use Alfred **tbflabon**, **tbflabpush**, **tbflaboff**). The root `lab-frontier.sh` is a wrapper that calls this script.

**Setup:** Use a separate Discord app for the lab; put its token, CLIENT_ID, and GUILD_ID in `blue_frontier/.env` (see plan section 1a or main README Environments).
