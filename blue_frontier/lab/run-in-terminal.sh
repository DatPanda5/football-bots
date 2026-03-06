#!/bin/bash
# Open Terminal and run the given lab action so you see output (and for start: live log tail).
# Usage: run-in-terminal.sh start | stop | restart | port
# Called from Alfred so Terminal opens and shows progress (e.g. tbflabport → see DB synced).

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LAB_DIR="$(cd "$(dirname "$0")" && pwd)"
ACTION="${1:-}"
CMD_FILE="$LAB_DIR/.run-cmd.sh"

case "$ACTION" in
  start)
    # Start lab then tail log with timestamps (Ctrl+C stops tail only; lab keeps running)
    cat > "$CMD_FILE" << EOF
cd "$REPO_ROOT" && ./lab-frontier.sh start && echo '' && echo '  📋 Tailing lab log (Ctrl+C to stop tail; lab keeps running):' && sleep 2 && tail -f "$LAB_DIR/logs/lab.log" | while IFS= read -r line; do echo "[\$(date '+%Y-%m-%d %H:%M:%S')] \$line"; done
EOF
    ;;
  stop)
    cat > "$CMD_FILE" << EOF
echo '' && echo '  🛑 Stopping lab...' && echo '' && cd "$REPO_ROOT" && ./lab-frontier.sh stop; echo ''; echo '  Press Enter to close...'; read
EOF
    ;;
  restart)
    cat > "$CMD_FILE" << EOF
echo '' && echo '  🔄 Restarting lab...' && echo '' && cd "$REPO_ROOT" && ./lab-frontier.sh restart; echo ''; echo '  Press Enter to close...'; read
EOF
    ;;
  port)
    cat > "$CMD_FILE" << EOF
echo '' && echo '  📥 Porting production DB to lab...' && echo '' && cd "$REPO_ROOT" && ./blue_frontier/lab/port-production-to-lab.sh; echo ''; echo '  Press Enter to close...'; read
EOF
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|port}"
    exit 1
    ;;
esac

chmod +x "$CMD_FILE"

# Always open a new window so output is visible (avoid "do script in front window" which was hiding output).
osascript -e "tell application \"Terminal\" to do script \"bash \\\"$CMD_FILE\\\"\""
osascript -e "tell application \"Terminal\" to activate"
