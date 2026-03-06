#!/bin/bash
# Port production predictions DB into the lab, then start the lab.
# Run from anywhere; Alfred keyword can call the repo-root wrapper that runs this.
# Requires: Railway CLI linked to production service, lab/.env.lab configured.

# Print immediately so output is visible in Terminal (no buffering)
echo ""
echo "  📥 Porting production DB to lab..."
echo ""

LAB_DIR="$(cd "$(dirname "$0")" && pwd)"
BLUE_FRONTIER="$(cd "$LAB_DIR/.." && pwd)"
REPO_ROOT="$(cd "$BLUE_FRONTIER/.." && pwd)"
BACKUP_FILE="$LAB_DIR/production-backup.b64"

# Ensure railway and node are on PATH when run from Alfred (minimal env)
export PATH="/usr/local/bin:/opt/homebrew/bin:${HOME}/.local/bin:${PATH}"
# Load nvm node if present (common for railway CLI)
if [[ -f "${HOME}/.nvm/nvm.sh" ]]; then
  source "${HOME}/.nvm/nvm.sh" 2>/dev/null || true
fi

cd "$REPO_ROOT" || { echo "  ❌ Could not cd to repo: $REPO_ROOT"; exit 1; }

echo "  🛑 1/4 Stopping lab..."
"$REPO_ROOT/lab-frontier.sh" stop 2>/dev/null || true
sleep 1

echo "  📥 2/4 Fetching production DB from Railway..."
RAILWAY_ERR=$(mktemp)
if ! railway run node "$BLUE_FRONTIER/backup-db.js" > "$BACKUP_FILE" 2>"$RAILWAY_ERR"; then
  echo "     ❌ Railway backup failed."
  if [[ -s "$RAILWAY_ERR" ]]; then
    echo "     $(cat "$RAILWAY_ERR")"
    if grep -q "No DB at" "$RAILWAY_ERR" 2>/dev/null; then
      echo ""
      echo "     💡 'railway run' doesn't use the same volume as your deployed bot, so /data is empty."
      echo "     Get the backup from the running service instead:"
      echo "       1. Railway dashboard → your service → Settings or Deploy → run a shell/one-off."
      echo "       2. In that shell run: node blue_frontier/backup-db.js (or the path your app uses)."
      echo "       3. Copy the base64 output and save to: $BACKUP_FILE"
      echo "       4. Then run: node $LAB_DIR/restore-from-production.js $BACKUP_FILE"
      echo "       5. Start lab: $REPO_ROOT/lab-frontier.sh start"
    fi
  else
    echo "     Is 'railway' in PATH? Try: railway link (in this repo), then run again."
  fi
  rm -f "$RAILWAY_ERR"
  exit 1
fi
rm -f "$RAILWAY_ERR"
if ! [[ -s "$BACKUP_FILE" ]]; then
  echo "     ❌ Backup file empty or missing. Check Railway link and DATA_DIR."
  exit 1
fi
echo "     ✅ Production DB fetched."

echo "  📋 3/4 Restoring into lab DB..."
node "$LAB_DIR/restore-from-production.js" "$BACKUP_FILE" || exit 1
echo "     ✅ Lab DB synced with production."

echo "  🚀 4/4 Starting lab..."
"$REPO_ROOT/lab-frontier.sh" start
echo ""
echo "  ✅ Done. Lab is running with production predictions."
echo ""
