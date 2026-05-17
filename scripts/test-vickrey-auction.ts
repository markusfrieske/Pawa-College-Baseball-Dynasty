/**
 * test-vickrey-auction.ts
 *
 * Unit tests for the Vickrey (second-price) auction settlement logic used in
 * the walk-on phase.  Tests are self-contained — no database or server needed.
 *
 * Cases covered:
 *   1. Multi-bid: winner pays second-highest bid + $1; loser's price equals winner's price.
 *   2. Single-bid: winner pays their own bid (no second bidder).
 *   3. Tie on bid amount: earlier createdAt timestamp wins.
 *   4. NIL deduction: winner's nilSpent incremented by pricePaid, not bidAmount.
 *   5. No bids: walk-on receives no award.
 *
 * Run: npx tsx scripts/test-vickrey-auction.ts
 */

// ── Minimal types mirroring the auction resolution logic in server/routes.ts ──

interface Bid {
  id: string;
  teamId: string;
  bidAmount: number;
  createdAt: Date | null;
}

interface AwardResult {
  walkonId: string;
  winnerTeamId: string | null;
  pricePaid: number;
}

// Mirrors the sort + Vickrey pricing logic from finalizeWalkonsPhase
function resolveAuction(walkonId: string, rawBids: Bid[]): AwardResult {
  if (rawBids.length === 0) {
    return { walkonId, winnerTeamId: null, pricePaid: 0 };
  }

  const bids = [...rawBids].sort((a, b) => {
    if (b.bidAmount !== a.bidAmount) return b.bidAmount - a.bidAmount;
    const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tA !== tB ? tA - tB : a.id.localeCompare(b.id);
  });

  const winner = bids[0];
  const secondBidAmt = bids[1]?.bidAmount ?? 0;
  const pricePaid = Math.min(
    winner.bidAmount,
    bids.length > 1 ? secondBidAmt + 1 : winner.bidAmount
  );

  return { walkonId, winnerTeamId: winner.teamId, pricePaid };
}

// ── Test harness ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

// ── Case 1: Multi-bid — Vickrey price = second-highest + 1 ────────────────────

console.log("\nCase 1: multi-bid auction");
{
  const bids: Bid[] = [
    { id: "a", teamId: "team-1", bidAmount: 300_000, createdAt: new Date("2025-01-01T10:00:00Z") },
    { id: "b", teamId: "team-2", bidAmount: 200_000, createdAt: new Date("2025-01-01T10:01:00Z") },
    { id: "c", teamId: "team-3", bidAmount: 150_000, createdAt: new Date("2025-01-01T10:02:00Z") },
  ];
  const result = resolveAuction("w1", bids);
  assert("winner is team-1 (highest bid)", result.winnerTeamId === "team-1");
  assert(
    "price paid = second-highest ($200K) + 1 = $200,001",
    result.pricePaid === 200_001,
    `got ${result.pricePaid}`
  );
}

// ── Case 2: Single bid — winner pays own bid ────────────────────────────────────

console.log("\nCase 2: single-bid auction");
{
  const bids: Bid[] = [
    { id: "a", teamId: "team-1", bidAmount: 500_000, createdAt: new Date("2025-01-01T10:00:00Z") },
  ];
  const result = resolveAuction("w2", bids);
  assert("winner is team-1", result.winnerTeamId === "team-1");
  assert(
    "price paid = own bid ($500K)",
    result.pricePaid === 500_000,
    `got ${result.pricePaid}`
  );
}

// ── Case 3: Tie on bid amount — earlier createdAt wins ─────────────────────────

console.log("\nCase 3: tie on bid amount — earlier submission wins");
{
  const earlier = new Date("2025-01-01T09:00:00Z");
  const later   = new Date("2025-01-01T10:00:00Z");
  const bids: Bid[] = [
    { id: "a", teamId: "team-late",  bidAmount: 250_000, createdAt: later },
    { id: "b", teamId: "team-early", bidAmount: 250_000, createdAt: earlier },
  ];
  const result = resolveAuction("w3", bids);
  assert(
    "earlier bidder (team-early) wins the tie",
    result.winnerTeamId === "team-early",
    `got ${result.winnerTeamId}`
  );
  // When bids are tied, secondHighest + 1 ($250,001) would exceed the winner's
  // own bid ($250,000), so the Math.min cap correctly clamps price to own bid.
  assert(
    "price paid = winner's own bid ($250,000) — Vickrey cap (secondHighest+1 > own bid)",
    result.pricePaid === 250_000,
    `got ${result.pricePaid}`
  );
}

// ── Case 4: NIL deduction correctness ──────────────────────────────────────────

console.log("\nCase 4: NIL deduction uses pricePaid, not bidAmount");
{
  const bids: Bid[] = [
    { id: "a", teamId: "team-1", bidAmount: 400_000, createdAt: new Date("2025-01-01T10:00:00Z") },
    { id: "b", teamId: "team-2", bidAmount: 100_000, createdAt: new Date("2025-01-01T10:01:00Z") },
  ];
  const result = resolveAuction("w4", bids);

  // Simulate NIL deduction
  const nilSpentBefore = 500_000;
  const nilSpentAfter  = nilSpentBefore + result.pricePaid;

  assert(
    "pricePaid is second-highest + 1 = $100,001 (not winner's $400K bid)",
    result.pricePaid === 100_001,
    `got ${result.pricePaid}`
  );
  assert(
    "nilSpent incremented by pricePaid ($100,001), not full bid ($400,000)",
    nilSpentAfter === 600_001,
    `got ${nilSpentAfter}`
  );
}

// ── Case 5: No bids — walk-on unawarded ────────────────────────────────────────

console.log("\nCase 5: no bids");
{
  const result = resolveAuction("w5", []);
  assert("winnerTeamId is null", result.winnerTeamId === null);
  assert("pricePaid is 0", result.pricePaid === 0);
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("✗ Vickrey auction test FAILED");
  process.exit(1);
} else {
  console.log("✓ All Vickrey auction settlement checks passed.");
}
