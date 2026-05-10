#!/bin/bash
set -e
npm install
npm run db:push -- --force
echo ""
echo "Running roster validators..."
npx tsx scripts/validate-all.ts
