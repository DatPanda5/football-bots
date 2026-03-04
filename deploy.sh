#!/bin/bash

# Blue Frontier Bot — Update & Deploy Script (PRODUCTION only).
# Run from football-bots repo root or any subfolder. Pushing triggers Railway auto-deploy.
# Alfred: updatetbf. For local lab (DATPANDA BOT TESTING), use blue_frontier/lab/lab-frontier.sh via ./lab-frontier.sh and tbflabon/tbflabpush/tbflaboff.

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

MSG="${1:-Blue Frontier bot update}"

echo "📦 Adding changes..."
git add .

echo "💾 Committing changes..."
git commit -m "$MSG"

echo "🚀 Pushing to GitHub..."
git push

echo ""
echo "✅ Update pushed, Railway will deploy in ~30 seconds"
echo ""
