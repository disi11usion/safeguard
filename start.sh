#!/usr/bin/env bash
# One-click dev launcher for the Safeguard AI Portfolio stack.
#
# Does:
#   1. Open Docker Desktop on macOS if it's not running.
#   2. Wait for the Docker daemon to be reachable.
#   3. `docker compose up -d --build` (delegated to `make up`).
#   4. Poll backend /v1/health until it returns 200.
#   5. Print the URLs and open the frontend in the default browser.
#
# Usage: ./start.sh
#        (or `bash start.sh` if not executable)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

# ── 1. Docker daemon ─────────────────────────────────────────────
if ! docker info >/dev/null 2>&1; then
  echo "› Docker daemon not running. Launching Docker Desktop…"
  case "$(uname -s)" in
    Darwin) open -a Docker ;;
    Linux)  systemctl --user start docker-desktop 2>/dev/null || sudo systemctl start docker ;;
    *)      echo "✗ Unsupported OS for auto-launch; start Docker manually."; exit 1 ;;
  esac
  echo -n "› Waiting for daemon"
  for i in $(seq 1 60); do
    if docker info >/dev/null 2>&1; then echo " ready (${i}s)"; break; fi
    echo -n "."; sleep 1
    if [ "$i" -eq 60 ]; then echo " timeout"; exit 1; fi
  done
fi

# ── 2. Bring up the stack ────────────────────────────────────────
echo "› docker compose up -d --build"
make up

# ── 3. Wait for backend ready ────────────────────────────────────
echo -n "› Waiting for backend /v1/health"
for i in $(seq 1 60); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/v1/health 2>/dev/null)" = "200" ]; then
    echo " ready (${i}s)"; break
  fi
  echo -n "."; sleep 2
  if [ "$i" -eq 60 ]; then echo " timeout — check 'docker compose logs backend'"; exit 1; fi
done

# ── 4. Print URLs + open browser ─────────────────────────────────
cat <<EOF

── Stack ready ─────────────────────────────────
  Frontend     http://localhost:3000
  Backend API  http://localhost:8000
  API docs     http://localhost:8000/docs
  Postgres     localhost:5433
  Redis        localhost:6379
  Ollama       localhost:11434

  Tail logs:   docker compose logs -f <service>
  Stop:        make down
────────────────────────────────────────────────
EOF

case "$(uname -s)" in
  Darwin) open http://localhost:3000 ;;
  Linux)  xdg-open http://localhost:3000 2>/dev/null || true ;;
esac
