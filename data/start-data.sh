#!/usr/bin/env bash
set -euo pipefail

# Standardization
if command -v dos2unix >/dev/null 2>&1; then
  # Batch convert to LF; do not block on failure (some read-only files/pipes)
  find /app -type f -name "*.sh" -print0 | xargs -0 -I{} sh -c 'dos2unix "{}" >/dev/null 2>&1 || true'
else
  # Alternative solution: use sed to remove \r
  find /app -type f -name "*.sh" -exec sed -i 's/\r$//' {} \;
fi

# Ensure permissions 
chmod +x /app/data/wait-for-db-init.sh

# Start-up
exec bash /app/data/wait-for-db-init.sh
