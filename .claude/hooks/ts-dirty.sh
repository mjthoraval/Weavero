#!/usr/bin/env bash
# PostToolUse (Edit|Write) hook: when a TypeScript file changes, record the
# tree that holds it (its git top-level), so the Stop hook typechecks THAT
# tree -- a worktree or a second clone, not always the project's checkout.
# One flag file per session (sessions sharing a project dir do not check
# each other's half-done edits), one tree per line.
input=$(cat 2>/dev/null || true)
case "$input" in *'"file_path"'*) ;; *) exit 0;; esac
fp=$(printf '%s' "$input" | grep -oE '"file_path"[[:space:]]*:[[:space:]]*"([^"\\]|\\.)*"' | head -n 1 \
  | sed -E 's/^"file_path"[[:space:]]*:[[:space:]]*"//; s/"$//; s/\\\\/\\/g; s/\\"/"/g; s/\\\//\//g')
case "$fp" in *.ts|*.mts|*.cts|*.tsx) ;; *) exit 0;; esac
case "$fp" in [A-Za-z]:\\*) fp=$(printf '%s' "$fp" | tr '\\' '/');; esac
dir=$(dirname -- "$fp")
[ -d "$dir" ] || exit 0
top=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) || top=""
if [ -z "$top" ]; then            # not in a git tree: the nearest package.json
  d=$dir
  while :; do
    [ -f "$d/package.json" ] && { top=$d; break; }
    nd=$(dirname -- "$d"); [ "$nd" = "$d" ] && break; d=$nd
  done
fi
[ -n "$top" ] || exit 0
sid=$(printf '%s' "$input" | grep -oE '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n 1 \
  | sed -E 's/^.*:[[:space:]]*"//; s/"$//' | tr -cd 'A-Za-z0-9_-')
flag="${CLAUDE_PROJECT_DIR:-.}/.claude/.ts-dirty${sid:+-$sid}"
grep -qxF -- "$top" "$flag" 2>/dev/null || printf '%s\n' "$top" >> "$flag" 2>/dev/null || true
exit 0
