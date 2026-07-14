#!/usr/bin/env npx tsx
/**
 * check-typography.ts
 * Automated guardrail: fails if banned typography patterns exist in runtime source.
 * Add to npm scripts as: "check:typography": "npx tsx scripts/check-typography.ts"
 */

import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, extname, relative } from "path";

const SRC_DIR = join(process.cwd(), "client", "src");
const FONTS_DIR = join(process.cwd(), "client", "public", "fonts");

// ── Allowlist: file paths that are explicitly approved to contain restricted patterns ──
const ALLOWLIST: Record<string, string[]> = {
  // GameWordmark is the one approved brand-pixel use
  "components/brand/GameWordmark.tsx": ["font-brand-pixel"],
};

const REQUIRED_FONT_FILES = [
  "inter-latin-wght-normal.woff2",
  "barlow-semi-condensed-latin-600-normal.woff2",
  "barlow-semi-condensed-latin-700-normal.woff2",
  "ibm-plex-mono-latin-500-normal.woff2",
  "ibm-plex-mono-latin-600-normal.woff2",
];

interface Violation {
  file: string;
  line: number;
  text: string;
  rule: string;
}

const violations: Violation[] = [];
let filesScanned = 0;

const RULES: Array<{ name: string; pattern: RegExp }> = [
  { name: "font-pixel (pixel font in UI)", pattern: /\bfont-pixel\b/ },
  { name: "Press Start 2P inline", pattern: /Press Start 2P/ },
  { name: "DotGothic16 inline", pattern: /DotGothic16/ },
  { name: "sub-12px arbitrary size (text-[5-11px])", pattern: /\btext-\[([5-9]|1[01])px\]/ },
  { name: "Google Fonts URL in runtime source", pattern: /fonts\.googleapis\.com|fonts\.gstatic\.com/ },
];

function checkFile(filePath: string): void {
  const rel = relative(SRC_DIR, filePath);
  const allowlisted = ALLOWLIST[rel] ?? [];
  const lines = readFileSync(filePath, "utf-8").split("\n");
  filesScanned++;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const rule of RULES) {
      if (allowlisted.some(a => line.includes(a))) continue;
      if (rule.pattern.test(line)) {
        violations.push({
          file: rel,
          line: i + 1,
          text: line.trim().slice(0, 100),
          rule: rule.name,
        });
      }
    }
  }
}

function walkDir(dir: string): void {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath);
    } else if ([".tsx", ".ts", ".css"].includes(extname(entry)) && !entry.includes(".d.ts")) {
      checkFile(fullPath);
    }
  }
}

console.log("\n🔍 Typography guardrail check\n");

// 1. Check source files
walkDir(SRC_DIR);

// 2. Check required font files exist
const missingFonts: string[] = [];
for (const f of REQUIRED_FONT_FILES) {
  if (!existsSync(join(FONTS_DIR, f))) {
    missingFonts.push(f);
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
console.log(`Files scanned: ${filesScanned}`);

if (missingFonts.length > 0) {
  console.log(`\n❌ Missing required font files:`);
  missingFonts.forEach(f => console.log(`   client/public/fonts/${f}`));
} else {
  console.log(`✅ All required font files present (${REQUIRED_FONT_FILES.length} files)`);
}

if (violations.length === 0) {
  console.log(`✅ No typography violations found\n`);
  process.exit(0);
} else {
  console.log(`\n❌ ${violations.length} typography violation(s) found:\n`);

  const byRule: Record<string, Violation[]> = {};
  for (const v of violations) {
    (byRule[v.rule] ??= []).push(v);
  }

  for (const [rule, vs] of Object.entries(byRule)) {
    console.log(`  [${rule}] — ${vs.length} instance(s):`);
    for (const v of vs.slice(0, 5)) {
      console.log(`    ${v.file}:${v.line}  ${v.text}`);
    }
    if (vs.length > 5) console.log(`    ... and ${vs.length - 5} more`);
    console.log();
  }

  process.exit(1);
}
