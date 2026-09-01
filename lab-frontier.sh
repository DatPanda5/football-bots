#!/bin/bash
# Wrapper: optional LOCAL Blue Frontier Lab (Alfred tbflabon / tbflaboff).
# Railway lab deploy: blue_frontier/lab/deploy-lab.sh (tbflabpush → run-in-terminal.sh deploy).
ROOT="$(cd "$(dirname "$0")" && pwd)"
exec "$ROOT/blue_frontier/lab/lab-frontier.sh" "$@"
