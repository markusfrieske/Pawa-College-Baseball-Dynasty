#!/usr/bin/env tsx
/**
 * Assigns role-based stamina bands to all pitchers in the 18 roster batch files.
 *
 * Band assignments by ordinal within each team's pitcher array:
 *   Slots 1–4  → Starters:      80–99
 *   Slot  5    → Long relief:   50–79
 *   Slots 6–N-1→ Mid relief:    30–49
 *   Slot  N    → Closer:         1–29
 * (For 9-pitcher teams N=9; for 10-pitcher teams N=10, etc.)
 *
 * After stamina reassignment the script also replaces Intimidator on any
 * pitcher now in the starter/long-relief band (stamina ≥ 50) with a
 * randomly-chosen starter-appropriate blue ability.
 *
 * Run: npx tsx scripts/fix-pitcher-stamina.ts
 */

import { RAW_UNCALIBRATED_ROSTERS } from "../server/realRosters";
import * as fs from "fs";
import * as path from "path";

// ── Constants ────────────────────────────────────────────────────────────────

const ROSTER_FILES = [
  "server/secBatch1.ts",
  "server/secBatch2.ts",
  "server/secBatch3.ts",
  "server/accRostersBatch1.ts",
  "server/accRostersBatch2.ts",
  "server/accRostersBatch3.ts",
  "server/bigTenBatch1.ts",
  "server/bigTenBatch2.ts",
  "server/bigTenBatch3.ts",
  "server/big12Rosters.ts",
  "server/pac12Rosters.ts",
  "server/aacRosters.ts",
  "server/sunBeltRosters.ts",
  "server/wccRosters.ts",
  "server/bigWestRosters.ts",
  "server/moValleyRosters.ts",
  "server/ivyLeagueRosters.ts",
  "server/hbcuRosters.ts",
];

const STARTER_REPLACEMENTS = [
  "Sharpness", "Heavy Ball", "vs. Strong Batters", "Staredown",
  "Inside Pitch", "Low Ball", "Escape Pitch", "Constant Speed",
  "Decisive", "Strikeout", "Good Pickoff", "Strong Finisher",
  "Tunneling", "Guts", "Crossfire", "Strong Starter", "Winner's Luck",
  "Quick Hands", "Natural Shuuto", "True Slider", "Pace", "Release",
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function assignStaminaBand(slot: number, total: number): number {
  if (slot <= 4) return randInt(80, 99);         // starter
  if (slot === 5) return randInt(50, 79);         // long relief
  if (slot === total) return randInt(1, 29);      // closer
  return randInt(30, 49);                          // mid relief
}

// ── Build pitcher → new stamina map (keyed by "firstName|lastName") ──────────
// Uses RAW_UNCALIBRATED_ROSTERS so no calibration scaling affects the ordering.

interface PitcherEntry {
  newStamina: number;
}

// Key: "firstName|lastName|teamName" to avoid collisions for players with the
// same name on different teams.
const pitcherEntries = new Map<string, PitcherEntry>();

for (const [teamName, players] of Object.entries(RAW_UNCALIBRATED_ROSTERS)) {
  const pitchers = players.filter((p) => p.position === "P");
  const total = pitchers.length;
  for (let i = 0; i < total; i++) {
    const p = pitchers[i];
    const key = `${p.firstName}|${p.lastName}|${teamName}`;
    pitcherEntries.set(key, { newStamina: assignStaminaBand(i + 1, total) });
  }
}

// ── Process each roster file ──────────────────────────────────────────────────

let totalStaminaReplaced = 0;
let totalIntimidatorReplaced = 0;

for (const relPath of ROSTER_FILES) {
  const fullPath = path.resolve(relPath);
  const original = fs.readFileSync(fullPath, "utf-8");
  const lines = original.split("\n");

  // State machine: track which team block we're currently inside.
  let currentTeam: string | null = null;
  // Track which line a pitcher starts on so we can find their abilities.
  let lastPitcherNameLine = -1;
  let lastPitcherNewStamina = -1;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];

    // Detect team boundary: lines like   "LSU": [  or   "Florida State": [
    const teamMatch = line.match(/^\s+"([^"]+)":\s*\[/);
    if (teamMatch) {
      currentTeam = teamMatch[1];
      continue;
    }

    if (!currentTeam) continue;

    // Detect pitcher name line
    const nameMatch = line.match(/firstName:\s*"([^"]+)",\s*lastName:\s*"([^"]+)",\s*position:\s*"P"/);
    if (nameMatch) {
      const firstName = nameMatch[1];
      const lastName = nameMatch[2];
      const key = `${firstName}|${lastName}|${currentTeam}`;
      const entry = pitcherEntries.get(key);
      if (entry) {
        lastPitcherNameLine = idx;
        lastPitcherNewStamina = entry.newStamina;
      }
      continue;
    }

    // Detect the attributes line (immediately after pitcher name line)
    if (lastPitcherNameLine >= 0 && idx === lastPitcherNameLine + 1) {
      const staminaMatch = line.match(/(\bstamina:\s*)\d+/);
      if (staminaMatch) {
        lines[idx] = line.replace(/(\bstamina:\s*)\d+/, `$1${lastPitcherNewStamina}`);
        totalStaminaReplaced++;
      }
      continue;
    }

    // Detect the abilities line for the current pitcher (within 5 lines of name)
    if (
      lastPitcherNameLine >= 0 &&
      idx > lastPitcherNameLine &&
      idx <= lastPitcherNameLine + 5 &&
      lastPitcherNewStamina >= 50 &&
      line.includes('"Intimidator"') &&
      line.includes("abilities:")
    ) {
      // Parse existing abilities from this line
      const abilityMatches = [...line.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
      const existing = abilityMatches.filter((name) => name !== "Intimidator");

      // Pick first starter replacement not already in the abilities
      const replacement = STARTER_REPLACEMENTS.find((r) => !existing.includes(r));
      if (replacement) {
        lines[idx] = line.replace('"Intimidator"', `"${replacement}"`);
      } else {
        // All replacements already present — just drop Intimidator
        lines[idx] = line
          .replace(/, "Intimidator"/, "")
          .replace(/"Intimidator", /, "")
          .replace(/"Intimidator"/, "");
      }
      totalIntimidatorReplaced++;
      lastPitcherNameLine = -1;
      lastPitcherNewStamina = -1;
      continue;
    }

    // Reset when we encounter another player's name line or the end of the team block
    if (line.includes('firstName:') && idx > lastPitcherNameLine + 1) {
      lastPitcherNameLine = -1;
      lastPitcherNewStamina = -1;
    }
  }

  const updated = lines.join("\n");
  if (updated !== original) {
    fs.writeFileSync(fullPath, updated, "utf-8");
    console.log(`  ✓ ${relPath}`);
  }
}

console.log(
  `\nDone: ${totalStaminaReplaced} stamina values updated, ` +
  `${totalIntimidatorReplaced} Intimidator abilities replaced on high-stamina pitchers.`
);
