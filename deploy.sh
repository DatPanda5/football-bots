#!/bin/bash

# Blue Frontier Bot — Update & Deploy Script (same flow as WokeDyche)
# Run from football-bots repo root or any subfolder. Pushing triggers Railway auto-deploy.

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
