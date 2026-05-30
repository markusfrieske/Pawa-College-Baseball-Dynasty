---
name: Pitcher OVR formula — sGradeCap rule
description: Critical scaling rule for pitcher OVR: raw attrs ≤90 are capped at 89 after scaling. Must be ≥91 raw to reach 99-tier pts.
---

# Pitcher OVR Formula — sGradeCap Rule

**The rule:** `sGradeCap = (val <= 90 || effectiveFactor < 1) ? 89 : 99`

Raw attr ≤90 → scaled value capped at 89 (never S-grade).
Raw attr ≥91 → scaled value can reach 99.

**Why it matters for OVR targets:**
- velocityZonePts(89) ≈ 60 pts; velocityZonePts(99) ≈ 71 pts
- controlTierPts(89) = 17.40; controlTierPts(99) = 24.36 (+6.96 jump at ≥90)
- staminaTierPts(89) = 8.70; staminaTierPts(99) = 12.18 (+3.48 jump at ≥90)

To get OVR ≥500 (gold-gate requirement), pitchers at low-scale schools need raw vel/ctrl/stam ≥91.

**PITCHER_COMMON_RAW attrs and grade A thresholds:**
- heater, wRISP: A=27.84, B=13.92, S=0 (gold-linked)
- vsLefty, recovery: A=13.92, B=6.96, S=0 (gold-linked)
- agile: A=6.96, B=3.48, S=0 (gold-linked)
- poise: A=0, B=0, E=-1.74 (poise A/B are neutral)

Grade A requires scaled val ≥80. With scale 1.205 (UCSB), raw ≥67 gives grade A.
Grade S requires scaled val ≥90. Only achievable with raw ≥91 (bypasses sGradeCap).

**Binary pitch fields (clamped to 1 regardless of input):**
pitchFB, pitchCH, pitchSFF — use level=1 for these in pitchMix calls, not higher values.

**pitchFB does NOT contribute to levelPts** — only PITCH_DIR_MAP secondary pitches (pitchSL, pitchCB, pitchCH, pitchCT, pitchSNK, pitchSPL, pitchFK, pitchSFF, pitchSHU) add levelPts and directionPts.

**P_BASE = 231** for all pitchers.
