#!/bin/bash
# Opens the dashboard every time the TV is switched on, and tells the relay so the dashboard greets.
# Asks the TV for its power state every 10 s; on an off -> on change it launches the app.
TV="${TV_IP:?set TV_IP}"
APP=$(grep -o 'application id="[^"]*"' /work/app/config.xml | cut -d'"' -f2)
state=unknown
echo "$(date '+%F %T') watching $TV"
while true; do
  # The TV keeps its network up in standby, so ask it directly: PowerState is "on" or "standby".
  ps=$(timeout 4 bash -c "exec 3<>/dev/tcp/$TV/8001 && printf 'GET /api/v2/ HTTP/1.0\r\nHost: tv\r\n\r\n' >&3 && cat <&3" 2>/dev/null | grep -o '"PowerState":"[a-zA-Z]*"' | cut -d'"' -f4)
  if [ "$ps" = on ]; then
    if [ "$state" != on ]; then
      echo "$(date '+%F %T') TV is on - opening the dashboard"
      # tell the relay, so the dashboard knows to greet
      if [ "$state" = off ]; then
        (exec 3<>/dev/tcp/host.docker.internal/8080 && printf 'GET /poweron HTTP/1.0\r\nHost: relay\r\n\r\n' >&3 && timeout 3 cat <&3 >/dev/null) 2>/dev/null || echo "  relay not reachable"
      fi
      sleep 6
      sdb connect "$TV" >/dev/null 2>&1
      if ! sdb -s "$TV:26101" shell 0 was_execute "$APP" 2>&1 | grep -qi "success\|launched\|ok"; then
        tizen run -s "$TV:26101" -p "$APP" >/dev/null 2>&1 && echo "  launched (tizen run)" || echo "  launch failed"
      else
        echo "  launched"
      fi
      sdb disconnect "$TV" >/dev/null 2>&1; sdb kill-server >/dev/null 2>&1
      state=on
    fi
  else
    if [ "$state" = on ]; then echo "$(date '+%F %T') TV is off"; fi
    state=off
  fi
  sleep 10
done
