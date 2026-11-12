#!/usr/bin/env bash
# Starts everything Homeport needs on this computer: the database, the API and the app.
# Usage: ./scripts/dev.sh        Anything after it is passed to "expo start", for example: ./scripts/dev.sh --tunnel
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .dev

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }
port_open() { (echo > "/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1; }
api_up() { curl -fsS http://localhost:8080/actuator/health >/dev/null 2>&1; }

# 1. The database
if port_open 5432; then
  say "Database: already running on port 5432."
elif command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  say "Database: starting PostgreSQL in Docker."
  docker compose up -d --wait db
else
  echo "No database found. Start Docker Desktop and run this again."
  echo "To use your own PostgreSQL instead, see docs/08-run-locally.md."
  exit 1
fi

# 2. The API (skipped when you already run it yourself, for example from your IDE)
if api_up; then
  say "API: already running on port 8080."
else
  say "API: starting. Its log is .dev/api.log"
  (cd apps/api && ./mvnw -q spring-boot:run -Dspring-boot.run.profiles=local) > .dev/api.log 2>&1 &
  API_PID=$!
  trap 'kill "$API_PID" 2>/dev/null || true' EXIT
  for _ in $(seq 1 120); do
    api_up && break
    if ! kill -0 "$API_PID" 2>/dev/null; then
      echo "The API stopped. The end of .dev/api.log:"
      tail -n 25 .dev/api.log
      exit 1
    fi
    sleep 2
  done
  api_up || { echo "The API didn't start within 4 minutes. See .dev/api.log"; exit 1; }
fi
say "API is up. Try it in a browser: http://localhost:8080/swagger-ui.html"

# 3. The app
cd apps/mobile
[ -d node_modules ] || npm install
say "Starting the app."
echo "  iPhone:        scan the QR code with the Camera app (it opens in Expo Go)"
echo "  iOS Simulator: press i      Browser: press w"
echo "  Sign in with any email. The code is 123456."
npx expo start "$@"
