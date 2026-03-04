#!/bin/bash
# Wrapper: runs Blue Frontier Lab script in blue_frontier/lab/ (Alfred: tbflabon, tbflabpush, tbflaboff).
# Production uses deploy.sh / updatetbf only.
ROOT="$(cd "$(dirname "$0")" && pwd)"
exec "$ROOT/blue_frontier/lab/lab-frontier.sh" "$@"
