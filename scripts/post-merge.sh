#!/bin/bash
set -e
npm ci
echo ""
echo "Running release-safe static checks..."

# Production schema changes are applied only by server/migrations through the
# numbered migration runner at startup. Never use drizzle-kit push --force here.
npm run typecheck

# validate-recruits is stochastic (Gem/Bust OVR depends on random attribute generation).
# Retry up to 3 times before treating a failure as real.
MAX_TRIES=3
for try in $(seq 1 $MAX_TRIES); do
  if npm run validate:data; then
    exit 0
  fi
  if [ $try -lt $MAX_TRIES ]; then
    echo ""
    echo "Validation failed (attempt $try/$MAX_TRIES) — retrying..."
    sleep 2
  fi
done

echo ""
echo "Validation failed after $MAX_TRIES attempts."
exit 1
