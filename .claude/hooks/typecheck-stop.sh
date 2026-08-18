#!/usr/bin/env bash
# Stop hook: if TypeScript sources changed this turn (.ts-dirty flag), the
# turn may not end until `npm run typecheck` passes. Exit 2 blocks the stop
# and feeds stderr back to Claude; exit 0 allows it.
input=$(cat 2>/dev/null || true)
case "$input" in *'"stop_hook_active":true'*) exit 0;; esac
proj="${CLAUDE_PROJECT_DIR:-.}"
flag="$proj/.claude/.ts-dirty"
[ -e "$flag" ] || exit 0
# Repo root holds package.json; a parent-dir checkout keeps the repo in GitHub/.
if [ -f "$proj/package.json" ]; then cd "$proj"; elif [ -f "$proj/GitHub/package.json" ]; then cd "$proj/GitHub"; else exit 0; fi
if npm run --silent typecheck >/tmp/wv-typecheck.log 2>&1; then
  rm -f "$flag"; exit 0
else
  echo "typecheck FAILED — fix before ending the turn:" >&2
  tail -30 /tmp/wv-typecheck.log >&2
  exit 2
fi
