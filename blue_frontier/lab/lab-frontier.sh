#!/bin/bash
# Blue Frontier Lab — start/stop/restart the bot locally (test in DATPANDA BOT TESTING server).
# Called from repo root via wrapper lab-frontier.sh, or directly: blue_frontier/lab/lab-frontier.sh start|stop|restart.
# Does NOT touch production (Railway); production uses its own token and deploy.sh / updatetbf.

LAB_DIR="$(cd "$(dirname "$0")" && pwd)"
BLUE_FRONTIER="$(cd "$LAB_DIR/.." && pwd)"
PID_FILE="$LAB_DIR/.lab-pid"
LOG_FILE="$LAB_DIR/logs/lab.log"

cmd="${1:-}"

start_lab() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid=$(cat "$PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      echo "  ⚠️  Lab already running (PID $pid). Use restart to apply changes."
      return 0
    fi
    rm -f "$PID_FILE"
  fi
  if ! [[ -d "$BLUE_FRONTIER" ]]; then
    echo "Error: blue_frontier not found at $BLUE_FRONTIER"
    return 1
  fi
  mkdir -p "$(dirname "$LOG_FILE")"
  cd "$BLUE_FRONTIER" || return 1
  if ! [[ -f "$LAB_DIR/.env.lab" ]]; then
    echo "Error: $LAB_DIR/.env.lab not found. Copy lab/.env.lab.example to lab/.env.lab and add lab bot credentials."
    return 1
  fi
  export DOTENV_CONFIG_PATH="$LAB_DIR/.env.lab"
  nohup node index.js >> "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  echo ""
  echo "  ✅ Blue Frontier Lab is up — ready for testing in Discord."
  echo "  → Server: DATPANDA BOT TESTING"
  echo "  → Log:    $LOG_FILE"
  echo "  → PID:    $(cat "$PID_FILE") (use tbflaboff or ./lab-frontier.sh stop to shut down)"
  echo ""
}

stop_lab() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid=$(cat "$PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null
      echo "  🛑 Blue Frontier Lab stopped (PID $pid)."
    else
      echo "  ⚠️  Lab was not running (stale PID file)."
    fi
    rm -f "$PID_FILE"
    return 0
  fi
  if pkill -f "blue_frontier.*index\.js" 2>/dev/null; then
    echo "  🛑 Blue Frontier Lab stopped (killed by process name)."
  else
    echo "  ⚠️  Lab was not running."
  fi
}

case "$cmd" in
  start)
    start_lab
    ;;
  stop)
    stop_lab
    ;;
  restart)
    echo "  🔄 Restarting Blue Frontier Lab..."
    stop_lab
    sleep 1
    start_lab
    ;;
  *)
    echo "Usage: $0 {start|stop|restart}"
    echo "  start   — start Blue Frontier Lab (background; test in DATPANDA BOT TESTING)"
    echo "  stop    — stop Blue Frontier Lab"
    echo "  restart — restart (for push updates)"
    exit 1
    ;;
esac
