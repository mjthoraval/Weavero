#!/bin/bash
# Timestamp Zotero process down/up transitions around a restart, by polling a
# TCP port the app owns (e.g. the dev-bridge RDP port, or the Local API port
# 23119). Usage: ./probe.sh [port] [logfile]
PORT="${1:-6100}"
LOG="${2:-restart-probe.log}"
now() { python -c "import time;print(int(time.time()*1000))"; }
state=up
echo "$(now) probe-start port=$PORT state=$state" > "$LOG"
end=$(( $(date +%s) + 600 ))
upSince=""
while [ "$(date +%s)" -lt "$end" ]; do
  if (echo > "/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then cur=up; else cur=down; fi
  if [ "$cur" != "$state" ]; then
    echo "$(now) $state->$cur" >> "$LOG"
    state=$cur
    if [ "$cur" = up ]; then upSince=$(date +%s); fi
  fi
  if [ "$state" = up ] && [ -n "$upSince" ] && [ $(( $(date +%s) - upSince )) -ge 20 ]; then
    echo "$(now) stable-up, exiting" >> "$LOG"; exit 0
  fi
  sleep 0.5
done
echo "$(now) timeout" >> "$LOG"
