#!/usr/bin/env npx tsx
/**
 * migrate-font-pixel.ts
 * Replaces font-pixel usage across client/src with semantic typography alternatives.
 * Upgrades all sub-12px arbitrary sizes to the 12px minimum floor.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

const SRC_DIR = join(process.cwd(), "client", "src");
const DRY_RUN = process.argv.includes("--dry-run");

// ── Ordered replacement rules (most specific first) ──────────────────────────
// Each [pattern, replacement] pair is applied to the full file content.
const REPLACEMENTS: Array<[RegExp, string]> = [
  // 1. Tiny arbitrary sizes (5-11px) paired with font-pixel
  [/font-pixel text-\[([5-9]|1[01])px\]/g, "text-xs font-semibold"],

  // 2. Specific arbitrary sizes
  [/font-pixel text-\[12px\]/g, "text-xs font-semibold"],
  [/font-pixel text-\[13px\]/g, "text-[0.8125rem] font-semibold"],
  [/font-pixel text-\[14px\]/g, "text-sm font-semibold"],
  [/font-pixel text-\[16px\]/g, "font-display text-base font-bold"],
  [/font-pixel text-\[18px\]/g, "font-display text-lg font-bold"],
  [/font-pixel text-\[20px\]/g, "font-display text-xl font-bold"],
  [/font-pixel text-\[24px\]/g, "font-display text-2xl font-bold"],

  // 3. Named Tailwind sizes — ordered lg→sm so longer matches win
  [/font-pixel text-3xl/g, "font-display text-3xl font-bold"],
  [/font-pixel text-2xl/g, "font-display text-2xl font-bold"],
  [/font-pixel text-xl/g, "font-display text-xl font-bold"],
  [/font-pixel text-lg/g, "font-display text-lg font-bold"],
  [/font-pixel text-base/g, "font-display text-base font-bold"],
  [/font-pixel text-sm/g, "font-display text-sm font-bold"],
  [/font-pixel text-xs/g, "text-xs font-semibold"],

  // 4. Remove any standalone remaining font-pixel (no size modifier beside it)
  //    Handle common class-string positions
  [/ font-pixel /g, " "],
  [/"font-pixel /g, '"'],
  [/ font-pixel"/g, '"'],
  [/`font-pixel /g, "`"],
  [/ font-pixel`/g, "`"],
];

// Also upgrade any non-font-pixel sub-12px arbitrary sizes
const SIZE_UPGRADES: Array<[RegExp, string]> = [
  [/\btext-\[([5-9])px\]/g, "text-xs"],
  [/\btext-\[1[01]px\]/g, "text-xs"],
];

let totalFiles = 0;
let changedFiles = 0;
let totalReplacements = 0;

function processFile(filePath: string): void {
  const original = readFileSync(filePath, "utf-8");
  let content = original;
  let fileChanges = 0;

  // Apply font-pixel replacements
  for (const [pattern, replacement] of REPLACEMENTS) {
    const before = content;
    content = content.replace(pattern, replacement);
    if (content !== before) {
      const count = (before.match(pattern) ?? []).length;
      fileChanges += count;
      totalReplacements += count;
    }
  }

  // Upgrade remaining sub-12px sizes
  for (const [pattern, replacement] of SIZE_UPGRADES) {
    const before = content;
    content = content.replace(pattern, replacement);
    if (content !== before) {
      const count = (before.match(pattern) ?? []).length;
      fileChanges += count;
      totalReplacements += count;
    }
  }

  if (content !== original) {
    changedFiles++;
    if (!DRY_RUN) {
      writeFileSync(filePath, content, "utf-8");
    }
    console.log(`  ${DRY_RUN ? "[DRY]" : "✓"} ${filePath.replace(SRC_DIR + "/", "")} (${fileChanges} changes)`);
  }
  totalFiles++;
}

function walkDir(dir: string): void {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath);
    } else if ([".tsx", ".ts", ".css"].includes(extname(entry)) && !entry.includes(".d.ts")) {
      processFile(fullPath);
    }
  }
}

console.log(`\n🔤 font-pixel migration ${DRY_RUN ? "(DRY RUN)" : ""}\n`);
walkDir(SRC_DIR);
console.log(`\n📊 Results:`);
console.log(`   Files scanned:  ${totalFiles}`);
console.log(`   Files changed:  ${changedFiles}`);
console.log(`   Replacements:   ${totalReplacements}`);

// Report remaining font-pixel instances
const { execSync } = await import("child_process");
try {
  const remaining = execSync(`grep -r "font-pixel" "${SRC_DIR}" --include="*.tsx" --include="*.ts" --include="*.css" -l 2>/dev/null || true`).toString().trim();
  if (remaining) {
    const count = remaining.split("\n").filter(Boolean).length;
    console.log(`\n⚠️  ${count} files still contain 'font-pixel':`);
    remaining.split("\n").filter(Boolean).forEach(f => console.log(`   ${f.replace(SRC_DIR + "/", "")}`));
  } else {
    console.log(`\n✅ No remaining font-pixel instances found.`);
  }
} catch {}
