#!/usr/bin/env bash
# Stop hook: run `npm run typecheck` in every tree where this session edited
# TypeScript (recorded by ts-dirty.sh). Errors block the stop: exit 2 feeds
# stderr back to Claude. When this stop already follows such a block
# (stop_hook_active), the turn ends anyway -- no endless loop -- but a JSON
# systemMessage names the failing tree(s) and their error counts for the
# user, and the trees stay recorded, so the next turn's stop checks again.
input=$(cat 2>/dev/null || true)
active=0
printf '%s' "$input" | grep -qE '"stop_hook_active"[[:space:]]*:[[:space:]]*true' && active=1
sid=$(printf '%s' "$input" | grep -oE '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n 1 \
  | sed -E 's/^.*:[[:space:]]*"//; s/"$//' | tr -cd 'A-Za-z0-9_-')
proj="${CLAUDE_PROJECT_DIR:-.}"
flag="$proj/.claude/.ts-dirty${sid:+-$sid}"
legacy="$proj/.claude/.ts-dirty"
trees=""
[ -f "$flag" ] && trees=$(cat "$flag")
# The previous hook only touched an empty .ts-dirty: check the checkout it
# always checked (the repo root, or GitHub/ in a parent-dir layout).
if [ -f "$legacy" ] && [ ! -s "$legacy" ]; then
  if [ -f "$proj/package.json" ]; then trees="$trees
$proj"
  elif [ -f "$proj/GitHub/package.json" ]; then trees="$trees
$proj/GitHub"
  fi
fi
[ -n "$trees" ] || { [ -f "$legacy" ] && [ ! -s "$legacy" ] && rm -f "$legacy"; exit 0; }

log=$(mktemp 2>/dev/null) || log="${TMPDIR:-/tmp}/wv-typecheck.$$.log"
seen="" failed="" summary="" details=""
while IFS= read -r t; do
  [ -n "$t" ] || continue
  case "
$seen
" in *"
$t
"*) continue;; esac
  seen="$seen
$t"
  [ -f "$t/package.json" ] || continue
  grep -qE '"typecheck"[[:space:]]*:' "$t/package.json" || continue
  (cd "$t" && npm run --silent typecheck) </dev/null >"$log" 2>&1 && continue
  n=$(grep -cE 'error TS[0-9]+' "$log")
  failed="$failed$t
"
  summary="${summary:+$summary; }$t: $n error(s)"
  details="$details
typecheck FAILED in $t ($n errors) -- fix before ending the turn:
$(tail -n 30 "$log")
"
done <<EOF
$trees
EOF
rm -f "$log"

[ "$flag" != "$legacy" ] && [ -f "$legacy" ] && [ ! -s "$legacy" ] && rm -f "$legacy"
if [ -z "$failed" ]; then
  rm -f "$flag"
  exit 0
fi
printf '%s' "$failed" > "$flag"
if [ "$active" = 1 ]; then
  msg="Typecheck still failing; the turn ended anyway. $summary (run npm run typecheck there)."
  esc=$(printf '%s' "$msg" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr -d '\000-\037')
  printf '{"systemMessage": "%s"}\n' "$esc"
  exit 0
fi
printf '%s\n' "$details" >&2
exit 2
