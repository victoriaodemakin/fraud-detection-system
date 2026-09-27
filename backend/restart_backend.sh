#!/bin/bash
# Stops any backend on :5073, rebuilds and starts it in the background (log: run_out.log).
# usage: restart_backend.sh [--fresh]   (--fresh deletes the SQLite file so it is re-created and re-seeded)
DIR="$(cd "$(dirname "$0")" && pwd)"
PID=$(netstat -ano | grep ":5073.*LISTENING" | awk '{print $5}' | head -1)
[ -n "$PID" ] && taskkill //F //PID $PID >/dev/null 2>&1 && sleep 2
if [ "$1" == "--fresh" ]; then rm -f "$DIR"/frauddetection.db "$DIR"/frauddetection.db-shm "$DIR"/frauddetection.db-wal; fi
dotnet build "$DIR" 2>&1 | grep -E " error |Build succeeded" | sort -u
(nohup dotnet run --project "$DIR" --no-build --no-launch-profile --urls http://localhost:5073 > "$DIR/run_out.log" 2>&1 &)
until netstat -ano | grep -q ":5073.*LISTENING"; do sleep 2; done
echo "backend up"
