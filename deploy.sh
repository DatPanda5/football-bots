#!/bin/bash
set -e

# Blue Frontier Bot — Update & Deploy Script (PRODUCTION only).
# Run from football-bots repo root or any subfolder. Pushing triggers Railway auto-deploy.
# Alfred: updatetbf. For local lab (DATPANDA BOT TESTING), use blue_frontier/lab/lab-frontier.sh via ./lab-frontier.sh and tbflabon/tbflabpush/tbflaboff.
# If git push fails from Alfred (e.g. "Permission denied"), run the same commands in Terminal so SSH/credential helper is available.

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

FORCE_REDEPLOY=""
MSG="Blue Frontier bot update"
for arg in "$@"; do
  if [ "$arg" = "--redeploy" ]; then
    FORCE_REDEPLOY=1
  else
    MSG="$arg"
  fi
done
[ -z "$MSG" ] && MSG="Blue Frontier bot update"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
echo "📌 Branch: $BRANCH"
echo ""

if [ -n "$FORCE_REDEPLOY" ]; then
  echo "🔄 Force redeploy (empty commit)..."
  git commit --allow-empty -m "$MSG"
else
  echo "📦 Adding changes..."
  git add .

  echo "💾 Committing changes..."
  if ! git commit -m "$MSG"; then
    echo ""
    echo "⚠️  Nothing to commit (no local changes). Pushing any existing commits..."
    git push
    echo ""
    echo "No new commit was pushed, so Railway will not redeploy."
    echo "To force a redeploy run:  ./deploy.sh --redeploy"
    exit 0
  fi
fi

echo "🚀 Pushing to GitHub..."
git push

echo ""
echo "✅ Update pushed to $BRANCH — Railway will deploy in ~30s (if it watches this branch)."
echo ""
