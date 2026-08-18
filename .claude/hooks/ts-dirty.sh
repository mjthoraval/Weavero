#!/usr/bin/env bash
# PostToolUse (Edit|Write) hook: mark the tree typecheck-dirty when a
# TypeScript source file changes. The Stop hook runs the gate once per turn.
input=$(cat 2>/dev/null || true)
case "$input" in
  *src*.ts*) touch "${CLAUDE_PROJECT_DIR:-.}/.claude/.ts-dirty" 2>/dev/null || true;;
esac
exit 0
