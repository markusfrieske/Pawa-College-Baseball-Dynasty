#!/bin/bash
set -e
npm install
npm run db:push -- --force
echo ""
echo "Running roster validators..."

# validate-recruits is stochastic (Gem/Bust OVR depends on random attribute generation).
# Retry up to 3 times before treating a failure as real.
MAX_TRIES=3
for try in $(seq 1 $MAX_TRIES); do
  if npx tsx scripts/validate-all.ts; then
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
