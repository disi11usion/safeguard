#!/usr/bin/env bash
# wait-for-db-init.sh
# Waits for the database initialization to complete before starting the data ingestion service

set -euo pipefail

echo "Waiting for database initialization to complete..."

# Database connection parameters from environment
DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-financeHub}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-password123}"

# Wait for PostgreSQL to be ready
until PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c '\q' 2>/dev/null; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 2
done

echo "PostgreSQL is up"

# Wait for the auth.users table to exist (indicator that db-init has completed)
echo "Waiting for database schema to be initialized..."
until PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1 FROM auth.users LIMIT 1" 2>/dev/null; do
  echo "Database schema not ready - sleeping"
  sleep 3
done

echo "Database initialization complete!"
echo "Starting data ingestion scheduler..."

# Start the data ingestion scheduler
exec python data/scheduler.py
