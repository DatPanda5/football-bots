#!/usr/bin/env bash
set -euo pipefail

# Push Blue Frontier LAB to Railway (branch: lab only — does not push main).
# Workflow: commit source on main (if needed) → merge main into lab → push origin/lab.
# Production stays on main + ./deploy.sh / Alfred updatetbf.

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
COMMIT_MSG="${1:-Blue Frontier lab update}"

cd "$REPO_DIR"

echo "== Blue Frontier LAB deploy (lab branch only) =="
echo "Repo: $REPO_DIR"

start_branch="$(git rev-parse --abbrev-ref HEAD)"

stage_source_on_main() {
  git add blue_frontier core lab-frontier.sh deploy.sh CHANGELOG.md PROJECT_STATUS_SUMMARY.md
}

has_source_changes() {
  ! git diff --quiet -- blue_frontier core lab-frontier.sh deploy.sh CHANGELOG.md PROJECT_STATUS_SUMMARY.md 2>/dev/null \
    || ! git diff --cached --quiet -- blue_frontier core lab-frontier.sh deploy.sh CHANGELOG.md PROJECT_STATUS_SUMMARY.md 2>/dev/null
}

if has_source_changes; then
  if [[ "$start_branch" != "main" ]]; then
    echo "ERROR: Uncommitted source changes on '$start_branch'."
    echo "Switch to main, commit, then run this script again."
    exit 1
  fi
  echo "Staging source on main (blue_frontier/, core/, lab scripts, CHANGELOG, PROJECT_STATUS)..."
  stage_source_on_main
  if git diff --cached --quiet; then
    echo "No source changes to commit after staging."
  else
    echo "Committing on main: $COMMIT_MSG"
    git commit -m "$COMMIT_MSG"
  fi
fi

if [[ "$start_branch" != "main" ]]; then
  echo "Switching to main for merge source..."
  git checkout main
  git pull --ff-only origin main
fi

if git show-ref --verify --quiet refs/heads/lab; then
  git checkout lab
else
  if git ls-remote --exit-code --heads origin lab >/dev/null 2>&1; then
    git checkout -b lab origin/lab
  else
    git checkout -b lab
  fi
fi

if git ls-remote --exit-code --heads origin lab >/dev/null 2>&1; then
  echo "Pulling latest lab..."
  git pull --ff-only origin lab
fi

echo "Merging main into lab..."
git merge main -m "Merge main: $COMMIT_MSG"

echo "Pushing origin/lab (main is not pushed)..."
if git ls-remote --exit-code --heads origin lab >/dev/null 2>&1; then
  git push origin lab
else
  git push -u origin lab
fi

if [[ "$start_branch" != "$(git rev-parse --abbrev-ref HEAD)" ]]; then
  git checkout "$start_branch"
fi

echo ""
echo "Done. Railway LAB service should auto-deploy from branch 'lab'."
echo "Production is unchanged until you run ./deploy.sh (updatetbf)."
